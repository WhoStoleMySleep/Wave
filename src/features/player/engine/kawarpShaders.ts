export const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    v_texCoord = a_texCoord;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

/** Five taps: the centre keeps the pass stable at small offsets, the diagonal ring spreads it at large ones. */
export const KAWASE_BLUR_SHADER = `
  precision highp float;
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_offset;
  varying vec2 v_texCoord;

  void main() {
    vec2 reach = (u_offset + 0.5) / u_resolution;
    vec4 ring = texture2D(u_texture, v_texCoord + reach)
      + texture2D(u_texture, v_texCoord - reach)
      + texture2D(u_texture, v_texCoord + vec2(reach.x, -reach.y))
      + texture2D(u_texture, v_texCoord + vec2(-reach.x, reach.y));
    gl_FragColor = (texture2D(u_texture, v_texCoord) + ring) / 5.0;
  }
`;

export const BLEND_SHADER = `
  precision highp float;
  uniform sampler2D u_texture1;
  uniform sampler2D u_texture2;
  uniform float u_blend;
  varying vec2 v_texCoord;

  void main() {
    vec4 from = texture2D(u_texture1, v_texCoord);
    vec4 to = texture2D(u_texture2, v_texCoord);
    gl_FragColor = from + (to - from) * clamp(u_blend, 0.0, 1.0);
  }
`;

/** Tints only the shadows, so a dark cover picks up the accent while its highlights stay untouched. */
export const TINT_SHADER = `
  precision highp float;
  uniform sampler2D u_texture;
  uniform vec3 u_tintColor;
  uniform float u_tintIntensity;
  varying vec2 v_texCoord;

  void main() {
    vec4 source = texture2D(u_texture, v_texCoord);
    float luma = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
    float shadow = 1.0 - smoothstep(0.05, 0.55, luma);
    gl_FragColor = vec4(mix(source.rgb, u_tintColor, shadow * u_tintIntensity), source.a);
  }
`;

/** Two layers of value noise, the second sampled through the first, drift the cover like slow liquid. */
export const DOMAIN_WARP_SHADER = `
  precision highp float;
  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_intensity;
  varying vec2 v_texCoord;

  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1371);
    q += dot(q, q.yzx + 19.19);
    return fract((q.x + q.y) * q.z);
  }

  float valueNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hash(cell);
    float b = hash(cell + vec2(1.0, 0.0));
    float c = hash(cell + vec2(0.0, 1.0));
    float d = hash(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
  }

  float layered(vec2 p) {
    return valueNoise(p) * 0.65 + valueNoise(p * 2.03 + 7.3) * 0.35;
  }

  vec2 field(vec2 p, vec2 seed) {
    return vec2(layered(p + seed), layered(p + seed.yx + 31.7));
  }

  void main() {
    float t = u_time * 0.07;
    vec2 uv = v_texCoord;
    vec2 base = field(uv * 0.9 + vec2(t, -t * 0.8), vec2(3.1, 11.4));
    vec2 detail = field(uv * 1.7 + base * 0.8 + vec2(-t * 0.7, t * 1.1), vec2(57.2, 23.9));
    vec2 offset = base * 0.55 + detail * 0.45;
    gl_FragColor = texture2D(u_texture, clamp(uv + offset * u_intensity * 0.3, 0.0, 1.0));
  }
`;

/** Dithering uses interleaved gradient noise shifted every frame, which hides 8-bit banding in the smooth gradients. */
export const OUTPUT_SHADER = `
  precision highp float;
  uniform sampler2D u_texture;
  uniform float u_saturation;
  uniform float u_dithering;
  uniform float u_time;
  uniform float u_scale;
  uniform vec2 u_resolution;
  varying vec2 v_texCoord;

  float gradientNoise(vec2 pixel) {
    return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
  }

  void main() {
    vec2 uv = clamp((v_texCoord - 0.5) / u_scale + 0.5, 0.0, 1.0);
    vec3 color = texture2D(u_texture, uv).rgb;

    float edge = length(v_texCoord - 0.5);
    color *= mix(1.0, 0.85, smoothstep(0.2, 0.75, edge));

    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luma), color, u_saturation);

    vec2 pixel = floor(v_texCoord * u_resolution) + floor(u_time * 60.0) * vec2(5.588238, 3.917);
    color += (gradientNoise(pixel) - 0.5) * u_dithering;

    gl_FragColor = vec4(color, 1.0);
  }
`;
