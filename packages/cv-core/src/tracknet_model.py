from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class ConvBlock(nn.Module):
    def __init__(self, in_c: int, out_c: int, k: int = 3, pad: int = 1) -> None:
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_c, out_c, k, padding=pad),
            nn.BatchNorm2d(out_c),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_c, out_c, k, padding=pad),
            nn.BatchNorm2d(out_c),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.conv(x)


class TrackNetV2(nn.Module):
    """
    TrackNetV2 architecture for shuttlecock/ball tracking.

    Input: 3 consecutive frames (9 channels: 3 frames x 3 RGB)
    Output: Single channel heatmap (ball location probability)

    Architecture: U-Net with VGG-like encoder, 3-frame temporal input.

    Paper: "TrackNetV2: Efficient Shuttlecock Tracking" (MMAsia 2023 variant)
    """

    def __init__(self, in_channels: int = 9, out_channels: int = 1) -> None:
        super().__init__()

        # Encoder (VGG-style)
        self.enc1 = ConvBlock(in_channels, 64)
        self.enc2 = ConvBlock(64, 128)
        self.enc3 = ConvBlock(128, 256)
        self.enc4 = ConvBlock(256, 512)

        self.pool = nn.MaxPool2d(2, 2)

        # Bottleneck
        self.bottleneck = ConvBlock(512, 512)

        # Decoder
        self.up4 = nn.ConvTranspose2d(512, 256, 2, stride=2)
        self.dec4 = ConvBlock(768, 256)

        self.up3 = nn.ConvTranspose2d(256, 128, 2, stride=2)
        self.dec3 = ConvBlock(384, 128)

        self.up2 = nn.ConvTranspose2d(128, 64, 2, stride=2)
        self.dec2 = ConvBlock(192, 64)

        self.up1 = nn.ConvTranspose2d(64, 32, 2, stride=2)
        self.dec1 = ConvBlock(96, 32)

        self.out_conv = nn.Conv2d(32, out_channels, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e1 = self.enc1(x)             # (B, 64,  H, W)
        p1 = self.pool(e1)            # (B, 64,  H/2, W/2)

        e2 = self.enc2(p1)            # (B, 128, H/2, W/2)
        p2 = self.pool(e2)            # (B, 128, H/4, W/4)

        e3 = self.enc3(p2)            # (B, 256, H/4, W/4)
        p3 = self.pool(e3)            # (B, 256, H/8, W/8)

        e4 = self.enc4(p3)            # (B, 512, H/8, W/8)
        p4 = self.pool(e4)            # (B, 512, H/16, W/16)

        b = self.bottleneck(p4)       # (B, 512, H/16, W/16)

        d4 = self.up4(b)              # (B, 256, H/8, W/8)
        d4 = torch.cat([d4, e4], dim=1)
        d4 = self.dec4(d4)

        d3 = self.up3(d4)             # (B, 128, H/4, W/4)
        d3 = torch.cat([d3, e3], dim=1)
        d3 = self.dec3(d3)

        d2 = self.up2(d3)             # (B, 64,  H/2, W/2)
        d2 = torch.cat([d2, e2], dim=1)
        d2 = self.dec2(d2)

        d1 = self.up1(d2)             # (B, 32,  H, W)
        d1 = torch.cat([d1, e1], dim=1)
        d1 = self.dec1(d1)

        out = self.out_conv(d1)
        return self.sigmoid(out)

    def detect(self, frames: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Run inference on 3 consecutive frames.

        Args:
            frames: Tensor of shape (B, 9, H, W) or (1, 9, H, W)

        Returns:
            (predicted_heatmap, predicted_position)
            heatmap: shape (B, 1, H, W)
            position: (x, y) in [0, 1] normalized coordinates
        """
        self.eval()
        with torch.no_grad():
            heatmap = self.forward(frames)

        batch_size = heatmap.shape[0]
        hm_flat = heatmap.view(batch_size, -1)
        max_idx = torch.argmax(hm_flat, dim=1)

        h = heatmap.shape[2]
        w = heatmap.shape[3]
        y_coords = (max_idx // w).float() / h
        x_coords = (max_idx % w).float() / w

        positions = torch.stack([x_coords, y_coords], dim=1)
        return heatmap, positions
