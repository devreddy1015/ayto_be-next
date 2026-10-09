import type { ImageSourcePropType } from "react-native"

/**
 * Riso print textures: tiny PNG tiles (generated, ~8 KB total) that are tiled
 * or stretched by the GPU. Nothing is drawn per frame.
 */
export const Riso: Record<"grain" | "dither" | "glow", ImageSourcePropType> = {
  /** 96px tile: heavy grain over 1-in-3 scanlines. Tile with resizeMode="repeat". */
  grain: require("../assets/riso/grain.png"),
  /** 4px ordered dither at 50%: a plate's second tone. Tile with resizeMode="repeat". */
  dither: require("../assets/riso/dither.png"),
  /** 64px white radial falloff, stretched and tinted for the lit corner. */
  glow: require("../assets/riso/glow.png"),
}
