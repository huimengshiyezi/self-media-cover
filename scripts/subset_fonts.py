# -*- coding: utf-8 -*-
"""字体瘦身脚本（方案A）：
字集 = GB2312 一级常用字(3755) + 水印文字 + 默认标题 + 标点数字字母 + 关键繁简字
"""
import sys
from pathlib import Path
from fontTools import subset

ASSETS = Path(__file__).resolve().parent.parent / "assets"

FONT_ALI = str(ASSETS / "AlibabaPuHuiTi-Bold.woff2")
FONT_SMILEY = str(ASSETS / "SmileySans-Regular.woff2")
OUT_ALI = str(ASSETS / "AlibabaPuHuiTi-Bold.woff2")
OUT_SMILEY = str(ASSETS / "SmileySans-Regular.woff2")

def build_charset() -> str:
    chars = set()

    # 1) GB2312 一级汉字（常用 3755 字，按拼音排序，覆盖 99.9% 日常用字）
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                c = bytes([hi, lo]).decode('gb2312')
                if len(c) == 1:
                    chars.add(c)
            except Exception:
                pass

    # 2) 水印文字（账号名可含繁体「葉」）
    chars.update("AI 绘梦师葉子")
    # 葉的简体「叶」已在 GB2312；再补常见繁体变体，防止账号改名
    chars.update("葉叶华华龙龙东东车车门门见见说说话话来来对对过过时时间间长长头头亲亲独独万万岁岁欢迎欢迎")

    # 3) 默认标题
    chars.update("你的公众号标题")

    # 4) 常用标点、数字、字母、符号
    chars.update("，。！？、；：""''（）《》〈〉【】『』「」…—·～、％￥＠＃＆＊＋－＝／＼｜《》「」")
    chars.update("0123456789")
    chars.update("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")
    chars.update(" \t\n\r")
    chars.update("!@#$%^&*()_+-=[]{};':\",./<>?\\|`~")

    return "".join(sorted(chars))

def subset_font(font_path: str, out_path: str, text: str):
    opts = subset.Options()
    # 保留默认 layout 特性（kern/liga 等），去掉不必要的表
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.drop_tables = ['FFTM', 'LTSH', 'DSIG', 'MERG', 'meta', 'hdmx']
    opts.flavor = 'woff2'
    s = subset.Subsetter(options=opts)
    with open(font_path, 'rb') as f:
        font = subset.load_font(f, opts)
    s.populate(text=text)
    s.subset(font)
    with open(out_path, 'wb') as f:
        subset.save_font(font, f, opts)
    print(f"OK: {out_path}")

if __name__ == '__main__':
    charset = build_charset()
    print(f"字集大小: {len(charset)} 字符")
    # 校验关键字符都在
    for ch in "AI绘梦师葉子你的公众号标题":
        if ch not in charset:
            print(f"警告: 关键字符缺失 {ch}")
    print(f"包含「葉」: {'葉' in charset}")
    print(f"包含「绘」: {'绘' in charset}")
    print(f"包含「梦」: {'梦' in charset}")
    subset_font(FONT_ALI, OUT_ALI, charset)
    subset_font(FONT_SMILEY, OUT_SMILEY, charset)
    print("全部完成")
