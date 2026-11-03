"""生成一条无版权环境音垫（纯 stdlib，可随时替换为正式配乐）。
用法: python promo/tools/make_bed.py [时长秒=96] [输出路径]
"""
import math, os, struct, sys, wave

SR = 48000
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 96.0
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join('promo', 'public', 'audio', 'bed.wav')
os.makedirs(os.path.dirname(OUT), exist_ok=True)


def lfo(t, hz, phase=0.0):
    return 0.5 + 0.5 * math.sin(2 * math.pi * hz * t + phase)


def main():
    n = int(SR * DUR)
    k = 0.25  # 一极低通，约 1.9kHz
    lp_l = lp_r = 0.0
    buf = bytearray()
    for i in range(n):
        t = i / SR
        swell = 0.55 + 0.45 * lfo(t, 0.045)
        l = (
            0.30 * math.sin(2 * math.pi * 110.00 * t) * (0.6 + 0.4 * lfo(t, 0.070))
            + 0.18 * math.sin(2 * math.pi * 164.81 * t + 0.5) * (0.5 + 0.5 * lfo(t, 0.055, 1.1))
            + 0.10 * math.sin(2 * math.pi * 220.00 * t + 2.0) * (0.4 + 0.6 * lfo(t, 0.033, 2.3))
            + 0.05 * math.sin(2 * math.pi * 329.63 * t) * lfo(t, 0.021, 0.7)
            + 0.02 * math.sin(2 * math.pi * 1320.0 * t) * lfo(t, 0.017, 3.1)
        ) * swell
        r = (
            0.30 * math.sin(2 * math.pi * 110.00 * t + 0.30)
            + 0.18 * math.sin(2 * math.pi * 164.81 * t + 0.9) * (0.5 + 0.5 * lfo(t, 0.049, 2.0))
            + 0.10 * math.sin(2 * math.pi * 220.00 * t + 2.4) * (0.4 + 0.6 * lfo(t, 0.037, 1.4))
            + 0.05 * math.sin(2 * math.pi * 329.63 * t + 0.4) * lfo(t, 0.025, 1.9)
            + 0.02 * math.sin(2 * math.pi * 1320.0 * t + 1.0) * lfo(t, 0.013, 0.3)
        ) * swell
        lp_l += k * (l - lp_l)
        lp_r += k * (r - lp_r)
        fade = min(1.0, t / 2.5, max(0.0, (DUR - t) / 3.5))
        buf += struct.pack(
            '<hh',
            int(max(-1.0, min(1.0, lp_l * fade * 0.92)) * 32000),
            int(max(-1.0, min(1.0, lp_r * fade * 0.92)) * 32000),
        )
    with wave.open(OUT, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(buf))
    print('wrote', OUT, os.path.getsize(OUT), 'bytes', DUR, 's')


if __name__ == '__main__':
    main()
