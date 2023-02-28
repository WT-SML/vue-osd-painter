<script setup>
import osd from "openseadragon"
import { onMounted, reactive, computed, onUnmounted, ref, watch } from "vue"
import { useMouseInElement, useMousePressed } from "@vueuse/core"

const props = defineProps({
  viewer: Object, // osd 查看器
  shapes: Array, // 需要渲染的形状数组
})

const emits = defineEmits(["add"])

const svgRef = ref(null)

const {
  x: mouseX,
  y: mouseY,
  isOutside: mouseIsOutside,
} = useMouseInElement(svgRef)

const { pressed: isMousePressed } = useMousePressed({
  target: svgRef,
})

// 监听当前工具
// watch(
//   () => props.painter.state.tools.current,
//   (newVal) => {
//     const viewer = props.painter.state.viewer
//     viewer.setMouseNavEnabled(
//       newVal === props.painter.state.tools.list.MOVE.name
//     )
//     state.tempShape = null
//     props.painter.state.tools.list[newVal].status = 0
//     // if (newVal === props.painter.state.tools.list.MOVE) {
//     //   // 移动
//     // } else if (newVal === props.painter.state.tools.list.RECT) {
//     //   // 矩形
//     // } else if (newVal === props.painter.state.tools.list.POLYGON) {
//     //   // 多边形
//     // }
//   }
// )

let watchMouseInfoStop = null
// 监听鼠标按下
watch(isMousePressed, (newVal) => {
  if (newVal) {
    console.log("按下")
    watchMouseInfoStop = watch([mouseX, mouseY], ([newMouseX, newMouseY]) => {
      console.log(newMouseX, newMouseY)
    })
  } else {
    console.log("抬起")
    watchMouseInfoStop && watchMouseInfoStop()
  }
})

const computedShapes = computed(() => {
  if (state.tempShape && state.tempShape.id) {
    return props.shapes.filter((item) => item.id !== state.tempShape.id)
  }
  return props.shapes
})

const state = reactive({
  transform: "", // svg 的定位
  tempShape: null, // 新增和编辑时的临时shape
})

// 监听 viewer 事件
const listenForViewerEvents = () => {
  const viewer = props.viewer
  viewer.addHandler("animation", () => updateTransform())
  viewer.addHandler("rotate", () => updateTransform())
  viewer.addHandler("resize", () => updateTransform())
  viewer.addHandler("flip", () => updateTransform())
}

// 获取比例
const getScale = () => {
  const viewer = props.viewer
  const containerWidth = viewer.viewport.getContainerSize().x
  const zoom = viewer.viewport.getZoom(true)
  return (zoom * containerWidth) / viewer.world.getContentFactor()
}

// 更新 transform
const updateTransform = () => {
  const viewport = props.viewer.viewport
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
  const viewer = props.viewer
  viewer.addHandler("open", () => {
    updateTransform()
    listenForViewerEvents()
  })
})
// 卸载
onUnmounted(() => {})
// 暴露数据
defineExpose({
  state,
})
</script>

<template>
  <div class="temp-panel">
    x：{{ mouseX }} <br />
    y：{{ mouseY }} <br />
    isOutside：{{ mouseIsOutside }}<br />
    isMousePressed：{{ isMousePressed }}
  </div>
  <svg ref="svgRef" class="painter">
    <g :transform="state.transform">
      <g
        v-for="item in computedShapes"
        :key="item.id"
        :data-id="item.id"
        class="shape-rect"
      >
        <!-- v-if="item.type === painter.state.tools.list.RECT.name" -->
        <rect
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
.temp-panel {
  position: fixed;
  top: 0;
  right: 0;
  border: 1px solid #ccc;
  background-color: #ddd;
  padding: 10px;
  z-index: 999;
  width: 200px;
}
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
  // 矩形
  .shape-rect {
    fill: rgba(255, 0, 0, 0);
    stroke: #f00;
    stroke-width: 2px;
  }
}
</style>
