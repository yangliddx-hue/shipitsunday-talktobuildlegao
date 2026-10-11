# 小小宇宙

小小的你创造大大的世界。

一款面向孩子的 AI 3D 创作工具，让孩子用说话把日常经历和奇思妙想搭成可以互动、修改和保存的世界。

## 演示视频

[▶ 打开「小小宇宙」Demo 视频](design/小小宇宙-演示剪辑.mp4)

[下载 MP4](https://github.com/yangliddx-hue/shipitsunday-talktobuildlegao/raw/refs/heads/main/design/%E5%B0%8F%E5%B0%8F%E5%AE%87%E5%AE%99-%E6%BC%94%E7%A4%BA%E5%89%AA%E8%BE%91.mp4)

## 运行

```bash
cp project.env.example project.env   # 填入 API_KEY
npm start              # 打开 http://localhost:5174
```

## 目录

| 路径 | 内容 |
|---|---|
| `live/` | 实时版：`server.mjs`（调用模型、指令格式）+ `index.html`（3D 渲染与动画） |
| `demo/` | 写死剧本的动效演示，直接用浏览器打开 |
| `docs/INT-001.md` | 产品 Intent |
| `IDEA.md` | 最初的产品 idea brief |
| `project.env` | 项目配置（不提交），模板见 `project.env.example` |

## 背景音乐

`live/music/` 中的曲目来自开源纯音乐素材库 **心声 Xinsheng**：

> 音乐来源：心声 Xinsheng by grrtyre
> 来源链接：https://github.com/grrtyre/xinsheng
> 采用协议：CC BY 4.0

| 文件 | 原曲名 | 用于 |
|---|---|---|
| `sunny1.mp3` / `sunny2.mp3` | 阳光与休闲 1 / 2 | 全程背景音乐，两首轮流播放 |
