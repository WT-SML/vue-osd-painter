<script setup>
import osd from "openseadragon"
import { onMounted, reactive } from "vue"
import vueOsdPainter from "./components"

const state = reactive({
  viewer: null, // osd 查看器
  painter: null, // 绘制器
  // 绘制的图形
  shapes: [
    {
      id: 1,
      type: "RECT",
      meta: {
        x: 2000,
        y: 2000,
        width: 2000,
        height: 2000,
      },
    },
    {
      id: 2,
      type: "RECT",
      meta: {
        x: 4000,
        y: 4000,
        width: 2000,
        height: 2000,
      },
    },
    {
      id: 3,
      type: "RECT",
      meta: {
        x: 6000,
        y: 6000,
        width: 2000,
        height: 2000,
      },
    },
  ],
})

onMounted(() => {
  const osdConf = {
    id: "osd", // 容器 dom Id
    tileSources:
      // "http://openseadragon.github.io/example-images/duomo/duomo.dzi", // 瓦片源
      "http://192.168.100.147/image/yice-dev/1623950836958834688.sdpc.dzi", // 瓦片源
    showNavigator: true, // 显示小地图
    navigatorPosition: "TOP_LEFT", // 设置缩略图的位置
    showNavigationControl: false, // 设置为false以防止出现默认导航控件。 注意，如果设置为false，由选项zoomInButton、zoomOutButton等设置的自定义按钮将呈现为非活动状态。
    animationTime: 0.3, // 动画过度时间
    defaultZoomLevel: 0, // 第一次打开图像或单击主页按钮时使用的缩放级别。 如果为0，则调整以适合查看器。
    maxZoomPixelRatio: 2, // 允许放大以影响最高级别像素比的最大比率。 这可以设置为Infinity，允许“无限”缩放图像，但如果HTML5 Canvas无法在查看设备上使用，这在视觉上就不那么有效了。
    minZoomLevel: 1, // 最小缩放等级
    maxZoomLevel: 80, // 最大缩放等级
    zoomPerClick: 1.0, // 每次鼠标点击或触摸点击的“缩放距离”。 注意:将此设置为1.0将有效地禁用点击缩放功能
    visibilityRatio: 0.5, // 源图像必须保持在视口中的百分比(从0到1的数字)。 如果图像被拖动超过这个限制，它将“反弹”回来，直到达到最小的能见度比。 将其设置为0并将wrapHorizontal(或wrapVertical)设置为true将提供无限滚动视口的效果。
    wrapHorizontal: false, // 设置为true强制图像在视口中水平包装。 用于表示球体或圆柱体表面的地图或图像。
    zoomPerScroll: 1.2, // 滚轮缩放速度
    timeout: 120000, // 一个映像作业完成所需要的最大毫秒数。
    navigatorAutoFade: false, // 自动隐藏小地图
    debugMode: false, // 调试模式
    debugGridColor: "#D95F02", // 调试模式网格颜色
    autoResize: true, // 设置为 false 以防止轮询查看器大小更改。对于提供自定义调整大小行为很有用。
    preserveImageSizeOnResize: true, // 设置为 true 以在调整查看器大小时保留图像大小。这需要 autoResize=true（默认）。
    minScrollDeltaTime: 50, // 画布滚动事件之间的毫秒数。此值有助于标准化不同设备之间的画布滚动事件的速率，从而使速度较快的设备减速到足以使缩放控制更易于管理。
  }
  state.viewer = new osd.Viewer(osdConf)
  const painterConf = {
    viewer: state.viewer, // osd 查看器
    shapes: state.shapes, // 需要渲染的图形
  }
  state.painter = new vueOsdPainter(painterConf)
  state.viewer.addHandler("open", () => {
    state.viewer.viewport.zoomTo(1)
  })
})

const add = () => {
  state.shapes.push({
    id: 4,
    type: "RECT",
    meta: {
      x: 8000,
      y: 2000,
      width: 2000,
      height: 2000,
    },
  })
}
const del = () => {
  state.shapes.pop()
}
</script>

<template>
  <div class="container">
    <div id="osd" class="osd"></div>
    <div class="tools">
      <button @click="add()">新增</button>
      <button @click="del()">删除</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.container {
  height: 100%;
  display: flex;
}
.osd {
  width: 70%;
  height: 100%;
  border-right: 1px #ccc solid;
}
.tools {
  width: 20%;
  height: 100%;
  padding: 30px;
}
</style>

<style lang="scss">
html,
body {
  margin: 0;
  padding: 0;
}
#app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
