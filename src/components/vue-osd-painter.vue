<script setup>
import { onMounted, reactive, computed, onUnmounted, ref } from "vue"
import osd from "openseadragon"

const props = defineProps({
  painter: Object, // 绘图器
})

const shapes = computed(() => {
  return props.painter.state.shapes
})

const state = reactive({
  transform: "",
})

// 监听 viewer 事件
const listenForViewerEvents = () => {
  const viewer = props.painter.state.viewer
  viewer.addHandler("animation", () => updateTransform())
  viewer.addHandler("rotate", () => updateTransform())
  viewer.addHandler("resize", () => updateTransform())
  viewer.addHandler("flip", () => updateTransform())
}

// 获取比例
const getScale = () => {
  const viewer = props.painter.state.viewer
  const containerWidth = viewer.viewport.getContainerSize().x
  const zoom = viewer.viewport.getZoom(true)
  return (zoom * containerWidth) / viewer.world.getContentFactor()
}

// 更新 transform
const updateTransform = () => {
  const viewport = props.painter.state.viewer.viewport
  const flipped = viewport.getFlip()
  const p = viewport.pixelFromPoint(new osd.Point(0, 0), true)
  if (flipped) {
    p.x = viewport._containerInnerSize.x - p.x
  }
  const scaleY = getScale()
  const scaleX = flipped ? -scaleY : scaleY
  const rotation = viewport.getRotation()
  state.transform = `translate(${p.x}, ${p.y}) scale(${scaleX}, ${scaleY}) rotate(${rotation})`
}

// 挂载
onMounted(() => {
  console.log(props)
  const viewer = props.painter.state.viewer
  viewer.addHandler("open", () => {
    updateTransform()
    listenForViewerEvents()
  })
})
// 卸载
onUnmounted(() => {
  props.painter.destroy()
})
</script>

<template>
  <svg class="painter">
    <g :transform="state.transform">
      <g
        v-for="item in shapes"
        :key="item.id"
        class="__painter-shape-rect"
        data-id="roi-1625401654709055490"
      >
        <rect
          v-if="item.type === painter.state.tools.list.RECT"
          :x="item.meta.x"
          :y="item.meta.y"
          :width="item.meta.width"
          :height="item.meta.height"
        ></rect>
      </g>
    </g>
  </svg>
</template>

<style lang="scss" scoped>
.painter {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  user-select: none;
  rect,
  circle,
  ellipse,
  path,
  polygon,
  line {
    vector-effect: non-scaling-stroke;
    cursor: pointer;
  }
  .__painter-shape-rect {
    fill: rgba(255, 0, 0, 0);
    stroke: #f00;
    stroke-width: 2px;
  }
}
</style>
