<script setup>
import osd from "openseadragon"
import {
  onMounted,
  reactive,
  computed,
  onUnmounted,
  ref,
  watch,
  getCurrentInstance,
} from "vue"
import { useMouseInElement, useMousePressed } from "@vueuse/core"

const props = defineProps({
  viewer: Object, // osd 查看器
  shapes: Array, // 需要渲染的形状数组
})

const emits = defineEmits(["add"])

const { proxy } = getCurrentInstance()

const svgRef = ref(null)
const svgRootGroupRef = ref(null)

const {
  x: mouseX,
  y: mouseY,
  isOutside: mouseIsOutside,
} = useMouseInElement(svgRef)

const { pressed: isMousePressed } = useMousePressed()
const tools = {
  MOVE: "MOVE",
  RECT: "RECT",
  POLYGON: "POLYGON",
  CIRCLE: "CIRCLE",
  ELLIPSE: "ELLIPSE",
  PATH: "PATH",
  CLOSED_PATH: "CLOSED_PATH",
  LINE: "LINE",
  ARROW_LINE: "ARROW_LINE",
  MULTISELECT: "MULTISELECT",
  EXCLUSION: "EXCLUSION",
}

const state = reactive({
  transform: "", // svg 的定位
  tempShape: null, // 新增和编辑时的临时shape
  tools, // 支持的工具
  mode: tools.MOVE, // 绘图模式
  c: {x:0,y:0},
})
// 监听绘图模式
watch(
  () => state.mode,
  (newVal) => {
    state.tempShape = null
    props.viewer.setMouseNavEnabled(newVal === state.tools.MOVE)
  }
)
// 监听鼠标按下
watch(isMousePressed, (newVal) => {
  if (newVal) {
    console.log("按下")
  } else {
    console.log("抬起")
  }
})
// 监听鼠标位置
watch([mouseX, mouseY], () => {
  state.c=(dziCoordByMouse.value)

  // const pt = svgRef.value.createSVGPoint()
  // pt.x = mouseX.value
  // pt.y = mouseY.value
  // state.c.push(
  //   pt.matrixTransform(svgRootGroupRef.value.getScreenCTM().inverse())
  // )
  // const d = `M0 0 ${state.c.map((item) => `L${item.x} ${item.y} `)}`
  // test.value.setAttribute("d", d)
})

// 鼠标实时的画布坐标
const dziCoordByMouse = computed(() =>
  props.viewer.viewport.viewerElementToImageCoordinates(
    new osd.Point(mouseX.value, mouseY.value)
  )
)

// 实际渲染的shapes，比如编辑中的shape会单独渲染，不作为常规shape渲染
const computedShapes = computed(() => {
  if (state.tempShape && state.tempShape.id) {
    return props.shapes.filter((item) => item.id !== state.tempShape.id)
  }
  return props.shapes
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
  updateTransform()
  listenForViewerEvents()
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
    isMousePressed：{{ isMousePressed }} dziCoordByMouse：{{ dziCoordByMouse }}
  </div>
  <svg ref="svgRef" class="painter">
    <g ref="svgRootGroupRef" :transform="state.transform">
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
      <g>
        <!-- <rect
          class="shape-path"
          :d="`M0 0 ${state.c.map((item) => `L${item.x} ${item.y} `)}`"
        ></rect> -->
        <rect
        class="shape-rect"
          :x="0"
          :y="0"
          :width="state.c.x"
          :height="state.c.y"
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
  }
  // 矩形
  .shape-rect {
    fill: rgba(255, 0, 0, 0);
    stroke: #f00;
    stroke-width: 2px;
  }
  // 路径
  .shape-path {
    fill: rgba(255, 0, 0, 0);
    stroke: #f00;
    stroke-width: 2px;
  }
}
</style>
