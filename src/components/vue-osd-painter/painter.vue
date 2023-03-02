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

const emits = defineEmits(["add", "remove", "update"])

const { proxy } = getCurrentInstance()

const svgRef = ref(null)
const svgRootGroupRef = ref(null)

const {
  x: mouseX,
  y: mouseY,
  isOutside: isMouseOutside,
} = useMouseInElement(svgRef)

const { pressed: isMousePressed } = useMousePressed()

const tools = {
  MOVE: "MOVE", // 移动
  RECT: "RECT", // 矩形
  POLYGON: "POLYGON", // 多边形
  CIRCLE: "CIRCLE", // 圆
  ELLIPSE: "ELLIPSE", // 椭圆
  PATH: "PATH", // 路径
  CLOSED_PATH: "CLOSED_PATH", // 闭合路径
  LINE: "LINE", // 直线
  ARROW_LINE: "ARROW_LINE", // 箭头直线
  POINT: "POINT", // 箭头直线
  MULTISELECT: "MULTISELECT", // 多选
  EXCLUSION: "EXCLUSION", // 排除
}

const state = reactive({
  transform: "", // svg 的定位
  tempShape: null, // 新增和编辑时的临时shape
  tools, // 支持的工具
  mode: tools.MOVE, // 绘图模式
  scale: 0, // 比例
})
// 工具对应的鼠标处理函数
const toolsMouseMap = {
  // 移动
  [state.tools.MOVE]: {
    // 按下
    handleMouseDown: () => {},
    // 抬起
    handleMouseUp: () => {},
    // 移动
    handleMouseMove: () => {},
  },
  // 矩形
  [state.tools.RECT]: {
    // 按下
    handleMouseDown: () => {
      if (isMouseOutside.value) {
        return
      }
      if (state.tempShape !== null) {
        return
      }
      state.tempShape = {
        id: null,
        type: state.tools.RECT,
        meta: {
          x: dziCoordByMouse.value.x,
          y: dziCoordByMouse.value.y,
          width: 0,
          height: 0,
        },
        // 临时变量
        temp: {
          start: {
            x: dziCoordByMouse.value.x,
            y: dziCoordByMouse.value.y,
          },
          end: {
            x: dziCoordByMouse.value.x,
            y: dziCoordByMouse.value.y,
          },
        },
      }
    },
    // 抬起
    handleMouseUp: () => {
      if (!state.tempShape) {
        return
      }
      if (!state.tempShape.meta.width || !state.tempShape.meta.height) {
        state.tempShape = null
        return
      }
      delete state.tempShape.temp
      state.tempShape.id = new Date().getTime()
      emits("add", state.tempShape)
      state.tempShape = null
    },
    // 移动
    handleMouseMove: () => {
      if (!state.tempShape) {
        return
      }
      state.tempShape.temp.end = dziCoordByMouse.value
      state.tempShape.meta.x = Math.min(
        state.tempShape.temp.end.x,
        state.tempShape.temp.start.x
      )
      state.tempShape.meta.y = Math.min(
        state.tempShape.temp.end.y,
        state.tempShape.temp.start.y
      )
      state.tempShape.meta.width = Math.abs(
        state.tempShape.temp.end.x - state.tempShape.temp.start.x
      )
      state.tempShape.meta.height = Math.abs(
        state.tempShape.temp.end.y - state.tempShape.temp.start.y
      )
    },
  },
  // 多边形
  [state.tools.POLYGON]: {
    // 按下
    handleMouseDown: () => {},
    // 抬起
    handleMouseUp: () => {},
    // 移动
    handleMouseMove: () => {},
  },
  // 圆
  [state.tools.CIRCLE]: {
    // 按下
    handleMouseDown: () => {
      if (isMouseOutside.value) {
        return
      }
      if (state.tempShape !== null) {
        return
      }
      state.tempShape = {
        id: null,
        type: state.tools.CIRCLE,
        meta: {
          cx: dziCoordByMouse.value.x,
          cy: dziCoordByMouse.value.y,
          rx: 0,
          ry: 0,
        },
        // 临时变量
        temp: {
          start: {
            x: dziCoordByMouse.value.x,
            y: dziCoordByMouse.value.y,
          },
          end: {
            x: dziCoordByMouse.value.x,
            y: dziCoordByMouse.value.y,
          },
        },
      }
    },
    // 抬起
    handleMouseUp: () => {
      if (!state.tempShape) {
        return
      }
      if (!state.tempShape.meta.rx || !state.tempShape.meta.ry) {
        state.tempShape = null
        return
      }
      delete state.tempShape.temp
      state.tempShape.id = new Date().getTime()
      emits("add", state.tempShape)
      state.tempShape = null
    },
    // 移动
    handleMouseMove: () => {
      if (!state.tempShape) {
        return
      }
      state.tempShape.temp.end = dziCoordByMouse.value
      const diffX = Math.abs(
        state.tempShape.temp.end.x - state.tempShape.temp.start.x
      )
      const diffY = Math.abs(
        state.tempShape.temp.end.y - state.tempShape.temp.start.y
      )
      const maxDiff = Math.max(diffX, diffY)
      const r = maxDiff / 2
      const circleCenterPoint = {
        x: (state.tempShape.temp.end.x + state.tempShape.temp.start.x) / 2,
        y: (state.tempShape.temp.end.y + state.tempShape.temp.start.y) / 2,
      }
      state.tempShape.meta.cx = circleCenterPoint.x
      state.tempShape.meta.cy = circleCenterPoint.y
      state.tempShape.meta.rx = r
      state.tempShape.meta.ry = r
    },
  },
  // 椭圆
  [state.tools.ELLIPSE]: {
    // 按下
    handleMouseDown: () => {
      if (isMouseOutside.value) {
        return
      }
      if (state.tempShape !== null) {
        return
      }
      state.tempShape = {
        id: null,
        type: state.tools.CIRCLE,
        meta: {
          cx: dziCoordByMouse.value.x,
          cy: dziCoordByMouse.value.y,
          rx: 0,
          ry: 0,
        },
        // 临时变量
        temp: {
          start: {
            x: dziCoordByMouse.value.x,
            y: dziCoordByMouse.value.y,
          },
          end: {
            x: dziCoordByMouse.value.x,
            y: dziCoordByMouse.value.y,
          },
        },
      }
    },
    // 抬起
    handleMouseUp: () => {
      if (!state.tempShape) {
        return
      }
      if (!state.tempShape.meta.rx || !state.tempShape.meta.ry) {
        state.tempShape = null
        return
      }
      delete state.tempShape.temp
      state.tempShape.id = new Date().getTime()
      emits("add", state.tempShape)
      state.tempShape = null
    },
    // 移动
    handleMouseMove: () => {
      if (!state.tempShape) {
        return
      }
      state.tempShape.temp.end = dziCoordByMouse.value
      const circleCenterPoint = {
        x: (state.tempShape.temp.end.x + state.tempShape.temp.start.x) / 2,
        y: (state.tempShape.temp.end.y + state.tempShape.temp.start.y) / 2,
      }
      state.tempShape.meta.cx = circleCenterPoint.x
      state.tempShape.meta.cy = circleCenterPoint.y
      state.tempShape.meta.rx =
        Math.abs(state.tempShape.temp.end.x - state.tempShape.temp.start.x) / 2
      state.tempShape.meta.ry =
        Math.abs(state.tempShape.temp.end.y - state.tempShape.temp.start.y) / 2
    },
  },
  // 路径
  [state.tools.PATH]: {
    // 按下
    handleMouseDown: () => {
      if (isMouseOutside.value) {
        return
      }
      if (state.tempShape !== null) {
        return
      }
      state.tempShape = {
        id: null,
        type: state.tools.PATH,
        meta: {
          d: [dziCoordByMouse.value],
        },
      }
    },
    // 抬起
    handleMouseUp: () => {
      if (!state.tempShape) {
        return
      }
      if (state.tempShape.meta.d.length < 2) {
        state.tempShape = null
        return
      }
      state.tempShape.id = new Date().getTime()
      emits("add", state.tempShape)
      state.tempShape = null
    },
    // 移动
    handleMouseMove: () => {
      if (!state.tempShape) {
        return
      }
      state.tempShape.meta.d.push(dziCoordByMouse.value)
    },
  },
  // 闭合路径
  [state.tools.CLOSED_PATH]: {
    // 按下
    handleMouseDown: () => {
      if (isMouseOutside.value) {
        return
      }
      if (state.tempShape !== null) {
        return
      }
      state.tempShape = {
        id: null,
        type: state.tools.CLOSED_PATH,
        meta: {
          d: [dziCoordByMouse.value],
        },
      }
    },
    // 抬起
    handleMouseUp: () => {
      if (!state.tempShape) {
        return
      }
      if (state.tempShape.meta.d.length < 2) {
        state.tempShape = null
        return
      }
      state.tempShape.id = new Date().getTime()
      emits("add", state.tempShape)
      state.tempShape = null
    },
    // 移动
    handleMouseMove: () => {
      if (!state.tempShape) {
        return
      }
      state.tempShape.meta.d.push(dziCoordByMouse.value)
    },
  },
  // 直线
  [state.tools.LINE]: {
    // 按下
    handleMouseDown: () => {
      if (isMouseOutside.value) {
        return
      }
      if (state.tempShape !== null) {
        return
      }
      state.tempShape = {
        id: null,
        type: state.tools.LINE,
        meta: {
          x1: dziCoordByMouse.value.x,
          y1: dziCoordByMouse.value.y,
          x2: dziCoordByMouse.value.x,
          y2: dziCoordByMouse.value.y,
        },
      }
    },
    // 抬起
    handleMouseUp: () => {
      if (!state.tempShape) {
        return
      }
      if (
        state.tempShape.meta.x1 === state.tempShape.meta.x2 &&
        state.tempShape.meta.y1 === state.tempShape.meta.y2
      ) {
        state.tempShape = null
        return
      }
      state.tempShape.id = new Date().getTime()
      emits("add", state.tempShape)
      state.tempShape = null
    },
    // 移动
    handleMouseMove: () => {
      if (!state.tempShape) {
        return
      }
      state.tempShape.meta.x2 = dziCoordByMouse.value.x
      state.tempShape.meta.y2 = dziCoordByMouse.value.y
    },
  },
  // 箭头直线
  [state.tools.ARROW_LINE]: {
    // 按下
    handleMouseDown: () => {
      if (isMouseOutside.value) {
        return
      }
      if (state.tempShape !== null) {
        return
      }
      state.tempShape = {
        id: null,
        type: state.tools.ARROW_LINE,
        meta: {
          x1: dziCoordByMouse.value.x,
          y1: dziCoordByMouse.value.y,
          x2: dziCoordByMouse.value.x,
          y2: dziCoordByMouse.value.y,
        },
      }
    },
    // 抬起
    handleMouseUp: () => {
      if (!state.tempShape) {
        return
      }
      if (
        state.tempShape.meta.x1 === state.tempShape.meta.x2 &&
        state.tempShape.meta.y1 === state.tempShape.meta.y2
      ) {
        state.tempShape = null
        return
      }
      state.tempShape.id = new Date().getTime()
      emits("add", state.tempShape)
      state.tempShape = null
    },
    // 移动
    handleMouseMove: () => {
      if (!state.tempShape) {
        return
      }
      state.tempShape.meta.x2 = dziCoordByMouse.value.x
      state.tempShape.meta.y2 = dziCoordByMouse.value.y
    },
  },
  // 点
  [state.tools.POINT]: {
    // 按下
    handleMouseDown: () => {
      if (isMouseOutside.value) {
        return
      }
      emits("add", {
        id: new Date().getTime(),
        type: state.tools.POINT,
        meta: {
          cx: dziCoordByMouse.value.x,
          cy: dziCoordByMouse.value.y,
        },
      })
    },
    // 抬起
    handleMouseUp: () => {},
    // 移动
    handleMouseMove: () => {},
  },
  // 多选
  [state.tools.MULTISELECT]: {
    // 按下
    handleMouseDown: () => {},
    // 抬起
    handleMouseUp: () => {},
    // 移动
    handleMouseMove: () => {},
  },
  // 排除
  [state.tools.EXCLUSION]: {
    // 按下
    handleMouseDown: () => {},
    // 抬起
    handleMouseUp: () => {},
    // 移动
    handleMouseMove: () => {},
  },
}
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
    toolsMouseMap[state.mode].handleMouseDown()
  } else {
    toolsMouseMap[state.mode].handleMouseUp()
  }
})

// 监听鼠标位置
watch([mouseX, mouseY], () => {
  toolsMouseMap[state.mode].handleMouseMove()
  // 另一种不依赖osd的api，自行计算的方法
  // const pt = svgRef.value.createSVGPoint()
  // pt.x = mouseX.value
  // pt.y = mouseY.value
  // console.log(
  //   pt.matrixTransform(svgRootGroupRef.value.getScreenCTM().inverse())
  // )
})

// 鼠标实时的画布坐标
const dziCoordByMouse = computed(() =>
  props.viewer.viewport.viewerElementToImageCoordinates(
    new osd.Point(mouseX.value, mouseY.value)
  )
)

// 实际渲染的shapes，比如编辑中的shape会单独渲染，不作为常规shape渲染
const computedShapes = computed(() => {
  if (state.tempShape?.id) {
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
  state.scale = scaleY
  state.transform = `translate(${p.x}, ${p.y}) scale(${scaleX}, ${scaleY}) rotate(${rotation})`
}

// 获取两点之间的距离
const getDistanceBetweenTwoPoints = (pointA, pointB) =>
  Math.sqrt(Math.pow(pointA.x - pointB.x, 2) + Math.pow(pointA.y - pointB.y, 2))

// 获取箭头的path
const getArrowPath = (shape) => {}

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
    isOutside：{{ isMouseOutside }}<br />
    isMousePressed：{{ isMousePressed }} <br />
    dziCoordByMouse：{{ dziCoordByMouse }}
  </div>
  <svg ref="svgRef" class="painter">
    <g ref="svgRootGroupRef" :transform="state.transform">
      <!-- 普通形状 -->
      <g
        v-for="item in computedShapes"
        :key="item.id"
        :class="`${item.type}_GROUP`"
      >
        <!-- 矩形 -->
        <rect
          v-if="item.type === state.tools.RECT"
          :class="item.type"
          :x="item.meta.x"
          :y="item.meta.y"
          :width="item.meta.width"
          :height="item.meta.height"
        ></rect>
        <!-- 多边形 -->
        <polygon
          v-if="item.type === state.tools.POLYGON"
          :class="item.type"
          :points="item.meta.points.map((pt) => `${pt.x},${pt.y} `)"
        ></polygon>
        <!-- 圆 -->
        <ellipse
          v-if="item.type === state.tools.CIRCLE"
          :class="item.type"
          :cx="item.meta.cx"
          :cy="item.meta.cy"
          :rx="item.meta.rx"
          :ry="item.meta.ry"
        ></ellipse>
        <!-- 椭圆 -->
        <ellipse
          v-if="item.type === state.tools.ELLIPSE"
          :class="item.type"
          :cx="item.meta.cx"
          :cy="item.meta.cy"
          :rx="item.meta.rx"
          :ry="item.meta.ry"
        ></ellipse>
        <!-- 路径 -->
        <path
          v-if="item.type === state.tools.PATH"
          :class="item.type"
          :d="`M${item.meta.d[0].x} ${item.meta.d[0].y} ${item.meta.d
            .slice(1)
            .map((pt) => `L${pt.x} ${pt.y} `)}`"
        ></path>
        <!-- 闭合路径 -->
        <path
          v-if="item.type === state.tools.CLOSED_PATH"
          :class="item.type"
          :d="`M${item.meta.d[0].x} ${item.meta.d[0].y} ${item.meta.d
            .slice(1)
            .map((pt) => `L${pt.x} ${pt.y} `)} Z`"
        ></path>
        <!-- 直线 -->
        <line
          v-if="item.type === state.tools.LINE"
          :class="item.type"
          :x1="item.meta.x1"
          :y1="item.meta.y1"
          :x2="item.meta.x2"
          :y2="item.meta.y2"
        ></line>
        <!-- 箭头直线 -->
        <template v-if="item.type === state.tools.ARROW_LINE">
          <line
            :class="item.type"
            :x1="item.meta.x1"
            :y1="item.meta.y1"
            :x2="item.meta.x2"
            :y2="item.meta.y2"
          ></line>
          <!-- TODO:附属箭头 -->
          <path
            class="ARROW_LINE_APPENDAGE_ARROW"
            :d="getArrowPath(item)"
            :transform="`scale(${1 / state.scale})`"
            :transform-origin="`${item.meta.x2} ${item.meta.y2}`"
          ></path>
        </template>
        <!-- 点 -->
        <circle
          v-if="item.type === state.tools.POINT"
          :class="item.type"
          :cx="item.meta.cx"
          :cy="item.meta.cy"
          :transform="`scale(${1 / state.scale})`"
          :transform-origin="`${item.meta.cx} ${item.meta.cy}`"
        ></circle>
      </g>
      <!-- 新增形状 -->
      <g class="ADD_GROUP" v-if="state.tempShape?.id === null">
        <!-- 矩形 -->
        <rect
          v-if="state.tempShape.type === state.tools.RECT"
          :class="state.tempShape.type"
          :x="state.tempShape.meta.x"
          :y="state.tempShape.meta.y"
          :width="state.tempShape.meta.width"
          :height="state.tempShape.meta.height"
        ></rect>
        <!-- 多边形 -->
        <polygon
          v-if="state.tempShape.type === state.tools.POLYGON"
          :class="state.tempShape.type"
          :points="state.tempShape.meta.points.map((pt) => `${pt.x},${pt.y} `)"
        ></polygon>
        <!-- TODO:多边形闭合锚点 -->
        <!-- 圆 -->
        <ellipse
          v-if="state.tempShape.type === state.tools.CIRCLE"
          :class="state.tempShape.type"
          :cx="state.tempShape.meta.cx"
          :cy="state.tempShape.meta.cy"
          :rx="state.tempShape.meta.rx"
          :ry="state.tempShape.meta.ry"
        ></ellipse>
        <!-- 椭圆 -->
        <ellipse
          v-if="state.tempShape.type === state.tools.ELLIPSE"
          :class="state.tempShape.type"
          :cx="state.tempShape.meta.cx"
          :cy="state.tempShape.meta.cy"
          :rx="state.tempShape.meta.rx"
          :ry="state.tempShape.meta.ry"
        ></ellipse>
        <!-- 路径 -->
        <path
          v-if="state.tempShape.type === state.tools.PATH"
          :class="state.tempShape.type"
          :d="`M${state.tempShape.meta.d[0].x} ${
            state.tempShape.meta.d[0].y
          } ${state.tempShape.meta.d
            .slice(1)
            .map((pt) => `L${pt.x} ${pt.y} `)}`"
        ></path>
        <!-- 闭合路径 -->
        <path
          v-if="state.tempShape.type === state.tools.CLOSED_PATH"
          :class="state.tempShape.type"
          :d="`M${state.tempShape.meta.d[0].x} ${
            state.tempShape.meta.d[0].y
          } ${state.tempShape.meta.d
            .slice(1)
            .map((pt) => `L${pt.x} ${pt.y} `)}`"
        ></path>
        <!-- 直线 -->
        <line
          v-if="state.tempShape.type === state.tools.LINE"
          :class="state.tempShape.type"
          :x1="state.tempShape.meta.x1"
          :y1="state.tempShape.meta.y1"
          :x2="state.tempShape.meta.x2"
          :y2="state.tempShape.meta.y2"
        ></line>
        <!-- 箭头直线 -->
        <line
          v-if="state.tempShape.type === state.tools.ARROW_LINE"
          :class="state.tempShape.type"
          :x1="state.tempShape.meta.x1"
          :y1="state.tempShape.meta.y1"
          :x2="state.tempShape.meta.x2"
          :y2="state.tempShape.meta.y2"
        ></line>
        <!-- TODO:箭头 -->
        <!-- 点 -->
        <circle
          v-if="state.tempShape.type === state.tools.POINT"
          :class="state.tempShape.type"
          :cx="state.tempShape.meta.cx"
          :cy="state.tempShape.meta.cy"
          :transform="`scale(${1 / state.scale})`"
          :transform-origin="`${state.tempShape.meta.cx} ${state.tempShape.meta.cy}`"
        ></circle>
      </g>
      <!-- 编辑形状 -->
      <g class="EDIT_GROUP" v-if="state.tempShape?.id">
        <!-- 矩形 -->
        <rect
          v-if="state.tempShape.type === state.tools.RECT"
          :class="state.tempShape.type"
          :x="state.tempShape.meta.x"
          :y="state.tempShape.meta.y"
          :width="state.tempShape.meta.width"
          :height="state.tempShape.meta.height"
        ></rect>
        <!-- 路径 -->
        <path
          v-if="state.tempShape.type === state.tools.PATH"
          :class="state.tempShape.type"
          :d="`M${state.tempShape.meta.d[0].x} ${
            state.tempShape.meta.d[0].y
          } ${state.tempShape.meta.d
            .slice(1)
            .map((pt) => `L${pt.x} ${pt.y} `)}`"
        ></path>
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
  ellipse,
  path,
  polygon,
  line {
    vector-effect: non-scaling-stroke;
  }
  // 普通形状
  // 矩形
  .RECT_GROUP {
    .RECT {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
  }
  // 多边形
  .POLYGON_GROUP {
    .POLYGON {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
  }
  // 圆
  .CIRCLE_GROUP {
    .CIRCLE {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
  }
  // 椭圆
  .ELLIPSE_GROUP {
    .ELLIPSE {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
  }
  // 路径
  .PATH_GROUP {
    .PATH {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
  }
  // 闭合路径
  .CLOSED_PATH_GROUP {
    .CLOSED_PATH {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
  }
  // 直线
  .LINE_GROUP {
    .LINE {
      stroke: #f00;
      stroke-width: 2px;
    }
  }
  // 箭头直线
  .ARROW_LINE_GROUP {
    .ARROW_LINE {
      stroke: #f00;
      stroke-width: 2px;
    }
  }
  // 点
  .POINT_GROUP {
    .POINT {
      fill: rgba(255, 255, 0, 0.5);
      stroke: #f00;
      stroke-width: 2px;
      r: 6;
    }
  }
  // 新增形状
  .ADD_GROUP {
    // 矩形
    .RECT {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 多边形
    .POLYGON {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 圆
    .CIRCLE {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 椭圆
    .ELLIPSE {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 路径
    .PATH {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 闭合路径
    .CLOSED_PATH {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 直线
    .LINE {
      stroke: #f00;
      stroke-width: 2px;
    }
    // 箭头直线
    .ARROW_LINE {
      stroke: #f00;
      stroke-width: 2px;
    }
    // 点
    .POINT {
      fill: rgba(255, 255, 0, 0.5);
      stroke: #f00;
      stroke-width: 2px;
      r: 6;
    }
  }
  // 编辑形状
  .EDIT_GROUP {
    // 矩形
    .RECT {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 多边形
    .POLYGON {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 圆
    .CIRCLE {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 椭圆
    .ELLIPSE {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 路径
    .PATH {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 闭合路径
    .CLOSED_PATH {
      fill: none;
      stroke: #f00;
      stroke-width: 2px;
    }
    // 直线
    .LINE {
      stroke: #f00;
      stroke-width: 2px;
    }
    // 箭头直线
    .ARROW_LINE {
      stroke: #f00;
      stroke-width: 2px;
    }
    // 点
    .POINT {
      fill: rgba(255, 255, 255, 1);
      stroke: #f00;
      stroke-width: 2px;
      r: 6;
    }
  }
}
</style>
