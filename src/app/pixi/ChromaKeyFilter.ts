import { Filter } from 'pixi.js';

/**
 * GPU-side green-screen removal.
 * Runs 100% on the GPU as a GLSL fragment shader — zero CPU pixel loop,
 * zero main-thread cost, handles any number of sprites simultaneously.
 *
 * Works for all character assets shot on solid green background.
 * (Acid Slime uses Cloudinary e_background_removal and needs NO filter here.)
 */
const FRAG = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;

void main(void) {
    vec4 c = texture2D(uSampler, vTextureCoord);

    // How "green" is this pixel relative to R and B channels?
    float diff = c.g - max(c.r, c.b);

    // Hard cut: strongly green pixel → fully transparent
    if (diff > 0.22) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Soft edge: transition zone → blend alpha + despill green channel
    if (diff > 0.08) {
        float t     = (diff - 0.08) / 0.14;
        float alpha = 1.0 - t;
        // Despill: replace green with average of R and B to kill green fringe
        float g = mix(c.g, (c.r + c.b) * 0.5, t);
        gl_FragColor = vec4(c.r * alpha, g * alpha, c.b * alpha, alpha);
        return;
    }

    // Non-green: pass through unchanged (premultiplied alpha already correct)
    gl_FragColor = c;
}
`;

export class ChromaKeyFilter extends Filter {
  constructor() {
    super(undefined, FRAG);
    this.padding = 0; // no extra pixel padding needed
  }
}
