//! culori's `p3/`, `a98/`, `rec2020/` and `prophoto/`: the RGB spaces only
//! `color()` reaches, converted to the XYZ space each one is defined in.

use super::super::js;
use super::lrgb::{sign_or_one, to_srgb_linear};

fn multiply(m: [[f64; 3]; 3], [r, g, b]: [f64; 3]) -> [f64; 3] {
  m.map(|row| row[0] * r + row[1] * g + row[2] * b)
}

/// culori's `convertP3ToXyz65`.
pub fn p3_to_xyz65(channels: [f64; 3]) -> [f64; 3] {
  multiply(
    [
      [0.486570948648216, 0.265667693169093, 0.1982172852343625],
      [0.2289745640697487, 0.6917385218365062, 0.079286914093745],
      [0.0, 0.0451133818589026, 1.043944368900976],
    ],
    channels.map(to_srgb_linear),
  )
}

/// culori's `convertA98ToXyz65`.
pub fn a98_to_xyz65(channels: [f64; 3]) -> [f64; 3] {
  multiply(
    [
      [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
      [0.297344975250536, 0.6273635662554661, 0.0752914584939979],
      [0.0270313613864123, 0.0706888525358272, 0.9913375368376386],
    ],
    channels.map(|v| v.abs().powf(563.0 / 256.0) * js::sign(v)),
  )
}

/// culori's `convertRec2020ToXyz65`.
pub fn rec2020_to_xyz65(channels: [f64; 3]) -> [f64; 3] {
  let (alpha, beta) = (1.09929682680944, 0.018053968510807);
  let linearize = |v: f64| {
    let abs = v.abs();
    if abs < beta * 4.5 {
      return v / 4.5;
    }
    sign_or_one(v) * ((abs + alpha - 1.0) / alpha).powf(1.0 / 0.45)
  };
  multiply(
    [
      [0.6369580483012911, 0.1446169035862083, 0.1688809751641721],
      [0.262700212011267, 0.6779980715188708, 0.059301716469862],
      [0.0, 0.0280726930490874, 1.0609850577107909],
    ],
    channels.map(linearize),
  )
}

/// culori's `convertProphotoToXyz50`.
pub fn prophoto_to_xyz50(channels: [f64; 3]) -> [f64; 3] {
  let linearize = |v: f64| {
    let abs = v.abs();
    if abs >= 16.0 / 512.0 {
      return js::sign(v) * abs.powf(1.8);
    }
    v / 16.0
  };
  let [r, g, b] = channels.map(linearize);
  [
    0.7977666449006423 * r + 0.1351812974005331 * g + 0.0313477341283922 * b,
    0.2880748288194013 * r + 0.7118352342418731 * g + 0.0000899369387256 * b,
    0.0 * r + 0.0 * g + 0.8251046025104602 * b,
  ]
}
