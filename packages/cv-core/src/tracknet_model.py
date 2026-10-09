"""TrackNet-family heatmap tracker for tiny, fast objects (shuttle/ball).

Generic single-frame box detectors miss most shuttle frames: YOLOv7 scored
F1 68.0 against TrackNetV3's 97.5 on the same benchmark (TrackNetV4 paper,
Table I), and YOLO11 reached only 0.548 recall on RacketVision badminton.
This module implements the TrackNet U-Net with the two upgrades that
verified results support:

* **Background input (TrackNetV3).** A median frame of the clip is stacked
  with the input frames, so static court texture is easy to ignore. On
  RacketVision it cut shuttle localisation error by 54.8%.
* **Motion attention (TrackNetV4).** Absolute frame differences pass through
  a learnable motion-prompt layer and re-weight the decoder features. On
  TrackNetV3 it raised F1 97.5 -> 97.9 and accuracy 95.7 -> 96.4, at almost
  no speed cost.

``width`` scales every channel count, giving a smaller on-device variant
(benchmark it on the target phone before shipping). Output is one heatmap
per input frame (multi-in multi-out, as in TrackNetV2/V3 and WASB).
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F  # noqa: N812


class ConvBlock(nn.Module):
    def __init__(self, in_c: int, out_c: int) -> None:
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_c, out_c, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_c),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_c, out_c, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_c),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.conv(x)


class MotionPrompt(nn.Module):
    """TrackNetV4-style motion attention from frame differences.

    ``A = sigmoid(a * |I_t - I_{t-1}| + b)`` per frame pair (grayscale), with
    learnable ``a`` and ``b``. The mean map re-weights decoder features
    residually: ``feat * (1 + A)``.
    """

    def __init__(self) -> None:
        super().__init__()
        self.slope = nn.Parameter(torch.tensor(5.0))
        self.bias = nn.Parameter(torch.tensor(-1.0))

    def forward(self, frames: torch.Tensor, num_frames: int) -> torch.Tensor:
        b, _, h, w = frames.shape
        gray = frames[:, : num_frames * 3].reshape(b, num_frames, 3, h, w).mean(dim=2)
        diffs = (gray[:, 1:] - gray[:, :-1]).abs()
        return torch.sigmoid(self.slope * diffs + self.bias).mean(dim=1, keepdim=True)


class TrackNet(nn.Module):
    """U-Net heatmap tracker.

    Args:
        num_frames: Consecutive RGB frames per input (3 in TrackNetV2, 8 in V3).
        use_background: Append a 3-channel median background image (V3).
        motion_attention: Enable the V4 motion-prompt attention.
        width: Channel multiplier (1.0 = TrackNetV2's 64-128-256-512 encoder).
        out_frames: Heatmaps predicted per input (1, or ``num_frames`` for MIMO).
    """

    def __init__(
        self,
        num_frames: int = 3,
        use_background: bool = False,
        motion_attention: bool = False,
        width: float = 1.0,
        out_frames: int = 1,
    ) -> None:
        super().__init__()
        self.num_frames = num_frames
        self.use_background = use_background
        self.out_frames = out_frames
        in_channels = 3 * num_frames + (3 if use_background else 0)
        c1, c2, c3, c4 = (max(8, int(c * width)) for c in (64, 128, 256, 512))

        self.enc1 = ConvBlock(in_channels, c1)
        self.enc2 = ConvBlock(c1, c2)
        self.enc3 = ConvBlock(c2, c3)
        self.enc4 = ConvBlock(c3, c4)
        self.bottleneck = ConvBlock(c4, c4)
        self.pool = nn.MaxPool2d(2, 2)

        self.dec4 = ConvBlock(c4 + c4, c3)
        self.dec3 = ConvBlock(c3 + c3, c2)
        self.dec2 = ConvBlock(c2 + c2, c1)
        self.dec1 = ConvBlock(c1 + c1, c1 // 2)
        self.motion = MotionPrompt() if motion_attention and num_frames > 1 else None
        self.out_conv = nn.Conv2d(c1 // 2, out_frames, 1)

    @property
    def in_channels(self) -> int:
        return 3 * self.num_frames + (3 if self.use_background else 0)

    @staticmethod
    def _up(x: torch.Tensor, skip: torch.Tensor) -> torch.Tensor:
        x = F.interpolate(x, size=skip.shape[-2:], mode="nearest")
        return torch.cat([x, skip], dim=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Map (B, C_in, H, W) in [0, 1] to (B, out_frames, H, W) probabilities."""
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        e4 = self.enc4(self.pool(e3))
        b = self.bottleneck(self.pool(e4))

        d = self.dec4(self._up(b, e4))
        d = self.dec3(self._up(d, e3))
        d = self.dec2(self._up(d, e2))
        d = self.dec1(self._up(d, e1))
        if self.motion is not None:
            d = d * (1.0 + self.motion(x, self.num_frames))
        return torch.sigmoid(self.out_conv(d))


def decode_heatmap(
    heatmap: torch.Tensor, threshold: float = 0.5,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Sub-pixel peak locations from heatmaps.

    Takes the argmax, then refines each axis with a parabola through the log
    intensities of the peak and its two neighbours. This is exact for a
    Gaussian blob and removes the up-to-half-pixel quantisation of a plain
    argmax, which matters at TrackNet's 4 px evaluation tolerance.

    Args:
        heatmap: (B, K, H, W) probabilities.
        threshold: Peaks below this are reported as not visible.

    Returns:
        ``(xy, score)``: (B, K, 2) pixel coordinates in heatmap resolution
        (NaN when not visible), and (B, K) peak scores.
    """
    b, k, h, w = heatmap.shape
    flat = heatmap.reshape(b, k, -1)
    score, idx = flat.max(dim=-1)
    cy, cx = idx // w, idx % w
    logs = flat.clamp_min(1e-9).log()

    def refine(center: torch.Tensor, size: int, step: int, other: torch.Tensor) -> torch.Tensor:
        lo, hi = (center - 1).clamp(min=0), (center + 1).clamp(max=size - 1)
        base = other * (w if step == 1 else 1)
        f0 = logs.gather(-1, (base + center * step)[..., None])[..., 0]
        fm = logs.gather(-1, (base + lo * step)[..., None])[..., 0]
        fp = logs.gather(-1, (base + hi * step)[..., None])[..., 0]
        curv = fm - 2 * f0 + fp
        delta = torch.where(curv < -1e-6, 0.5 * (fm - fp) / curv, torch.zeros_like(curv))
        interior = (center > 0) & (center < size - 1)
        return center.float() + torch.where(interior, delta.clamp(-0.5, 0.5), 0.0)

    x = refine(cx, w, 1, cy)
    y = refine(cy, h, w, cx)
    xy = torch.stack([x, y], dim=-1)
    xy[score < threshold] = float("nan")
    return xy, score


def weighted_bce(pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    """TrackNetV2/V3 weighted binary cross-entropy.

    ``-[(1-p)^2 y log p + p^2 (1-y) log(1-p)]``: focal-style, so confident
    background pixels (almost all of them) contribute little.
    """
    p = pred.clamp(1e-7, 1 - 1e-7)
    loss = -((1 - p) ** 2 * target * torch.log(p) + p ** 2 * (1 - target) * torch.log(1 - p))
    return loss.mean()
