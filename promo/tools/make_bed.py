"""生成宣传片背景音乐（纯标准库合成；正式配乐可直接替换本文件产物）。
结构：I-vi-IV-V 走向的暖色垫底 + 铃铛式琶音 + 低频脉冲 + 轻微空气感，首尾淡入淡出。
用法: python promo/tools/make_bed.py [时长秒=60] [输出=promo/public/audio/bed.wav]
"""
import array
import math
import os
import struct
import sys
import wave

SR = 48000
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 60.0
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join('promo', 'public', 'audio', 'bed.wav')

BAR = 3.75          # 每小节 3.75 秒（舒缓的 64 BPM，4/4）
STEP = BAR / 5      # 琶音步长
CHORDS = [
    [261.63, 329.63, 392.00, 493.88],   # C
    [220.00, 261.63, 329.63, 392.00],   # Am
    [174.61, 220.00, 261.63, 349.23],   # F
    [196.00, 246.94, 293.66, 392.00],   # G
    [174.61, 220.00, 261.63, 349.23],   # F
    [196.00, 246.94, 293.66, 392.00],   # G
    [261.63, 329.63, 392.00, 523.25],   # C
    [220.00, 261.63, 329.63, 440.00],   # Am
]


def env(t, dur, attack, release):
    if t < 0 or t > dur:
        return 0.0
    if t < attack:
        return t / attack
    if t > dur - release:
        return max(0.0, (dur - t) / release)
    return 1.0


def main():
    n = int(SR * DUR)
    lp_l = lp_r = 0.0
    samples = array.array('h')
    k = 0.85  # 一极低通，截止约 6.5kHz：暖但不闷
    for i in range(n):
        t = i / SR
        bar = int(t / BAR)
        tones = CHORDS[bar % len(CHORDS)]
        bar_t = t - bar * BAR

        # 垫底：四个音叠加，带轻微失谐与颤音，进出各 1.2s
        pad = 0.0
        pad_env = env(bar_t, BAR, 1.2, 1.4)
        vib = 1.0 + 0.0015 * math.sin(2 * math.pi * 4.7 * t)
        for idx, f in enumerate(tones):
            det = 1.0 + 0.0012 * (idx - 1.5)
            pad += (0.12 if idx == 0 else 0.085) * math.sin(2 * math.pi * f * det * vib * t)
        pad *= pad_env

        # 琶音：每小节 5 个音，指数衰减的铃铛音（高一八度）
        step = int(bar_t / STEP)
        st = bar_t - step * STEP
        tone = 0.0
        if step < 5:
            f = tones[(step + bar) % len(tones)] * 2.0
            dec = math.exp(-st * 3.4)
            tone = 0.24 * dec * (
                math.sin(2 * math.pi * f * t)
                + 0.28 * math.sin(2 * math.pi * f * 2 * t)
                + 0.06 * math.sin(2 * math.pi * f * 3 * t)
            )

        # 低频脉冲：小节头轻轻一下
        pulse = 0.0
        if bar_t < 0.9:
            pulse = 0.26 * math.exp(-bar_t * 6.0) * math.sin(2 * math.pi * 58.0 * t)

        # 空气感：极轻的高频微光 + 慢速呼吸
        air = 0.004 * math.sin(2 * math.pi * 1568.0 * t) * (0.5 + 0.5 * math.sin(2 * math.pi * 0.07 * t))

        pan = 0.25 if step % 2 == 0 else -0.25
        left = pad * 0.62 + tone * (0.5 - pan) + pulse * 0.55 + air
        right = pad * 0.62 + tone * (0.5 + pan) + pulse * 0.55 + air * 0.9

        lp_l += k * (left - lp_l)
        lp_r += k * (right - lp_r)
        fade = min(1.0, t / 1.5, max(0.0, (DUR - t) / 5.0))
        glue = 1.0 / math.tanh(1.2)
        l = math.tanh(1.2 * lp_l * fade) * glue
        r = math.tanh(1.2 * lp_r * fade) * glue
        samples.append(int(max(-1.0, min(1.0, l)) * 32767))
        samples.append(int(max(-1.0, min(1.0, r)) * 32767))

    peak = max((abs(x) for x in samples), default=0)
    if peak:
        gain = 0.88 * 32767 / peak
        for i in range(len(samples)):
            samples[i] = int(samples[i] * gain)
    with wave.open(OUT, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(samples.tobytes())
    print('wrote', OUT, os.path.getsize(OUT), 'bytes', DUR, 's  归一化前峰值', round(peak / 32767, 3), '→ 0.88')


if __name__ == '__main__':
    main()
