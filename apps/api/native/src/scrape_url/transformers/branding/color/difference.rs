//! culori's `differenceCiede2000` with its default weights.

use std::f64::consts::PI;

use super::{Color, Mode, lab, to_rgb};

/// culori `converter('lab65')`: xyz65 converts directly, the rest through sRGB.
fn to_lab65(color: &Color) -> [f64; 3] {
  match color.mode {
    Mode::Xyz65 => lab::xyz65_to_lab65(color.channels.map(|c| c.unwrap_or(0.0))),
    _ => lab::rgb_to_lab65(&to_rgb(color)),
  }
}

fn hue_angle(a: f64, b: f64) -> f64 {
  let h = if a.abs() + b.abs() == 0.0 {
    0.0
  } else {
    b.atan2(a)
  };
  if h < 0.0 { h + 2.0 * PI } else { h }
}

/// culori `differenceCiede2000()(std, smp)`.
pub fn ciede2000(std: &Color, smp: &Color) -> f64 {
  let [l_std, a_std, b_std] = to_lab65(std);
  let [l_smp, a_smp, b_smp] = to_lab65(smp);
  let c_std = (a_std * a_std + b_std * b_std).sqrt();
  let c_smp = (a_smp * a_smp + b_smp * b_smp).sqrt();
  let c_avg = (c_std + c_smp) / 2.0;
  let g = 0.5 * (1.0 - (c_avg.powf(7.0) / (c_avg.powf(7.0) + 25f64.powf(7.0))).sqrt());

  let ap_std = a_std * (1.0 + g);
  let ap_smp = a_smp * (1.0 + g);
  let cp_std = (ap_std * ap_std + b_std * b_std).sqrt();
  let cp_smp = (ap_smp * ap_smp + b_smp * b_smp).sqrt();
  let hp_std = hue_angle(ap_std, b_std);
  let hp_smp = hue_angle(ap_smp, b_smp);

  let dl = l_smp - l_std;
  let dc = cp_smp - cp_std;
  let mut dhp = if cp_std * cp_smp == 0.0 {
    0.0
  } else {
    hp_smp - hp_std
  };
  if dhp > PI {
    dhp -= 2.0 * PI;
  }
  if dhp < -PI {
    dhp += 2.0 * PI;
  }
  let dh = 2.0 * (cp_std * cp_smp).sqrt() * (dhp / 2.0).sin();

  let lp = (l_std + l_smp) / 2.0;
  let cp = (cp_std + cp_smp) / 2.0;
  let hp = if cp_std * cp_smp == 0.0 {
    hp_std + hp_smp
  } else {
    let mut hp = (hp_std + hp_smp) / 2.0;
    if (hp_std - hp_smp).abs() > PI {
      hp -= PI;
    }
    if hp < 0.0 { hp + 2.0 * PI } else { hp }
  };

  let lpm50 = (lp - 50.0).powf(2.0);
  let t = 1.0 - 0.17 * (hp - PI / 6.0).cos()
    + 0.24 * (2.0 * hp).cos()
    + 0.32 * (3.0 * hp + PI / 30.0).cos()
    - 0.2 * (4.0 * hp - (63.0 * PI) / 180.0).cos();
  let sl = 1.0 + (0.015 * lpm50) / (20.0 + lpm50).sqrt();
  let sc = 1.0 + 0.045 * cp;
  let sh = 1.0 + 0.015 * cp * t;
  let delta_theta = ((30.0 * PI) / 180.0) * (-(((180.0 / PI) * hp - 275.0) / 25.0).powf(2.0)).exp();
  let rc = 2.0 * (cp.powf(7.0) / (cp.powf(7.0) + 25f64.powf(7.0))).sqrt();
  let rt = -(2.0 * delta_theta).sin() * rc;

  ((dl / sl).powf(2.0) + (dc / sc).powf(2.0) + (dh / sh).powf(2.0) + (((rt * dc) / sc) * dh) / sh)
    .sqrt()
}
