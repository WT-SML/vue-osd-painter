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
import { lineAngle, pointRotate, pointInPolygon, lineLength } from "geometric"
import RBush from "rbush"

const props = defineProps({
  viewer: Object, // osd 查看器
  shapes: Array, // 需要渲染的形状数组
})

const emits = defineEmits(["add", "remove", "update"])

const svgRef = ref(null)
const svgRootGroupRef = ref(null)

const {
  x: mouseX,
  y: mouseY,
  isOutside: isMouseOutside,
} = useMouseInElement(svgRef)

const { pressed: isMousePressed, sourceType: mouseSourceType } =
  useMousePressed()

// 初始化形状边界数组
const shapesBounds = new RBush()
// 获取形状边界
const getBounds = (shape) => {
  return shapeTypeGetBoundsFuncMap[shape.type](shape)
}
const getPolygonBounds = (points) => {
  const xMap = points.map((item) => item.x)
  const yMap = points.map((item) => item.y)
  return {
    minX: Math.min(...xMap),
    minY: Math.min(...yMap),
    maxX: Math.max(...xMap),
    maxY: Math.max(...yMap),
  }
}
const shapeTypeGetBoundsFuncMap = {
  // 移动
  MOVE: (shape) => {},
  // 矩形
  RECT: (shape) => {
    return {
      minX: shape.meta.x,
      minY: shape.meta.y,
      maxX: shape.meta.x + shape.meta.width,
      maxY: shape.meta.y + shape.meta.height,
      id: shape.id,
    }
  },
  // 多边形
  POLYGON: (shape) => {
    return {
      ...getPolygonBounds(shape.meta.points),
      id: shape.id,
    }
  },
  // 圆
  CIRCLE: (shape) => {
    return {
      minX: shape.meta.cx - shape.meta.rx,
      minY: shape.meta.cy - shape.meta.ry,
      maxX: shape.meta.cx + shape.meta.rx,
      maxY: shape.meta.cy + shape.meta.ry,
      id: shape.id,
    }
  },
  // 椭圆
  ELLIPSE: (shape) => {
    return {
      minX: shape.meta.cx - shape.meta.rx,
      minY: shape.meta.cy - shape.meta.ry,
      maxX: shape.meta.cx + shape.meta.rx,
      maxY: shape.meta.cy + shape.meta.ry,
      id: shape.id,
    }
  },
  // 路径
  PATH: (shape) => {
    return {
      ...getPolygonBounds(shape.meta.d),
      id: shape.id,
    }
  },
  // 闭合路径
  CLOSED_PATH: (shape) => {
    return {
      ...getPolygonBounds(shape.meta.d),
      id: shape.id,
    }
  },
  // 直线
  LINE: (shape) => {
    return {
      minX: Math.min(shape.meta.x1, shape.meta.x2),
      minY: Math.min(shape.meta.y1, shape.meta.y2),
      maxX: Math.max(shape.meta.x1, shape.meta.x2),
      maxY: Math.max(shape.meta.y1, shape.meta.y2),
      id: shape.id,
    }
  },
  // 箭头直线
  ARROW_LINE: (shape) => {
    return {
      minX: Math.min(shape.meta.x1, shape.meta.x2),
      minY: Math.min(shape.meta.y1, shape.meta.y2),
      maxX: Math.max(shape.meta.x1, shape.meta.x2),
      maxY: Math.max(shape.meta.y1, shape.meta.y2),
      id: shape.id,
    }
  },
  // 点
  POINT: (shape) => {
    return {
      minX: shape.meta.cx,
      minY: shape.meta.cy,
      maxX: shape.meta.cx,
      maxY: shape.meta.cy,
      id: shape.id,
    }
  },
  // 多选
  MULTISELECT: (shape) => {},
  // 排除
  EXCLUSION: (shape) => {},
}
const initShapesBounds = () => {
  shapesBounds.load(props.shapes.map((shape) => getBounds(shape)))
}
initShapesBounds()
// 多边形工具下距离初始点过近
const isPolygonToolToStartPointTooClose = computed(() => {
  if (!state.tempShape) {
    return false
  }
  if (state.tempShape.type !== state.tools.POLYGON) {
    return false
  }
  return (
    lineLength(
      [state.tempShape.meta.points[0].x, state.tempShape.meta.points[0].y],
      [dziCoordByMouse.value.x, dziCoordByMouse.value.y]
    ) <
    14 / state.scale
  )
})
const hoverShape = computed(() => {
  if (state.mode !== state.tools.MOVE) {
    return null
  }
  if (isMouseOutside.value) {
    return null
  }
  const scale = state.scale
  const buffer = scale ? 5 / scale : 5
  const { x, y } = dziCoordByMouse.value
  const mouseBounds = {
    minX: x - buffer,
    minY: y - buffer,
    maxX: x + buffer,
    maxY: y + buffer,
  }
  // 外接矩形的粗略命中
  const cursoryHitBounds = state.shapesBounds.search(mouseBounds)
  // 详细的命中
  const detailedHitBounds = cursoryHitBounds.filter((bounds) => {
    const shape = props.shapes.filter((item) => item.id === bounds.id)[0]
    if (shape.type === state.tools.POINT) {
      return true
    }
    return pointInShape({ x, y }, shape, buffer)
  })
  // 返回详细命中中的面积最小的那一个
  if (detailedHitBounds.length) {
    if (detailedHitBounds.length === 1) {
      return props.shapes.filter(
        (item) => item.id === detailedHitBounds[0].id
      )[0]
    }
    detailedHitBounds.sort((a, b) => {
      const shapeA = props.shapes.filter((item) => item.id === a.id)[0]
      const shapeB = props.shapes.filter((item) => item.id === b.id)[0]
      return getShapeArea(shapeA) - getShapeArea(shapeB)
    })
    return props.shapes.filter((item) => item.id === detailedHitBounds[0].id)[0]
  }
  return null
})
// 获取shape的面积
const getShapeArea = (shape) => {
  return shapeTypeGetShapeAreaFuncMap[shape.type](shape)
}
const shapeTypeGetShapeAreaFuncMap = {
  // 移动
  MOVE: (shape) => {},
  // 矩形
  RECT: (shape) => {
    return shape.meta.width * shape.meta.height
  },
  // 多边形
  POLYGON: (shape) => {
    let area = 0
    const points = shape.meta.points
    let j = points.length - 1

    for (let i = 0; i < points.length; i++) {
      area += (points[j].x + points[i].x) * (points[j].y - points[i].y)
      j = i
    }
    return Math.abs(0.5 * area)
  },
  // 圆
  CIRCLE: (shape) => {
    return shape.meta.rx * shape.meta.ry * Math.PI
  },
  // 椭圆
  ELLIPSE: (shape) => {
    return shape.meta.rx * shape.meta.ry * Math.PI
  },
  // 路径
  PATH: (shape) => {
    let area = 0
    const points = shape.meta.d
    let j = points.length - 1

    for (let i = 0; i < points.length; i++) {
      area += (points[j].x + points[i].x) * (points[j].y - points[i].y)
      j = i
    }
    return Math.abs(0.5 * area)
  },
  // 闭合路径
  CLOSED_PATH: (shape) => {
    let area = 0
    const points = shape.meta.d
    let j = points.length - 1

    for (let i = 0; i < points.length; i++) {
      area += (points[j].x + points[i].x) * (points[j].y - points[i].y)
      j = i
    }
    return Math.abs(0.5 * area)
  },
  // 直线
  LINE: (shape) => {
    return 0
  },
  // 箭头直线
  ARROW_LINE: (shape) => {
    return 0
  },
  // 点
  POINT: (shape) => {
    return -1
  },
  // 多选
  MULTISELECT: (shape) => {},
  // 排除
  EXCLUSION: (shape) => {},
}
// 点是否在shape内
const pointInShape = (point, shape, buffer) => {
  return shapeTypePointInShapeFuncMap[shape.type](point, shape, buffer)
}
const shapeTypePointInShapeFuncMap = {
  // 移动
  MOVE: (point, shape, buffer) => {},
  // 矩形
  RECT: (point, shape, buffer) => {
    return (
      point.x >= shape.meta.x &&
      point.x <= shape.meta.x + shape.meta.width &&
      point.y >= shape.meta.y &&
      point.y <= shape.meta.y + shape.meta.height
    )
  },
  // 多边形
  POLYGON: (point, shape, buffer) => {
    return pointInPolygon(
      [point.x, point.y],
      shape.meta.points.map((item) => [item.x, item.y])
    )
  },
  // 圆
  CIRCLE: (point, shape, buffer, rotation = 0) => {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const dx = point.x - shape.meta.cx
    const dy = point.y - shape.meta.cy
    const tdx = cos * dx + sin * dy
    const tdy = sin * dx - cos * dy
    return (
      (tdx * tdx) / (shape.meta.rx * shape.meta.rx) +
        (tdy * tdy) / (shape.meta.ry * shape.meta.ry) <=
      1
    )
  },
  // 椭圆
  ELLIPSE: (point, shape, buffer, rotation = 0) => {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const dx = point.x - shape.meta.cx
    const dy = point.y - shape.meta.cy
    const tdx = cos * dx + sin * dy
    const tdy = sin * dx - cos * dy
    return (
      (tdx * tdx) / (shape.meta.rx * shape.meta.rx) +
        (tdy * tdy) / (shape.meta.ry * shape.meta.ry) <=
      1
    )
  },
  // 路径
  PATH: (point, shape, buffer) => {
    return pointInPolygon(
      [point.x, point.y],
      shape.meta.d.map((item) => [item.x, item.y])
    )
  },
  // 闭合路径
  CLOSED_PATH: (point, shape, buffer) => {
    return pointInPolygon(
      [point.x, point.y],
      shape.meta.d.map((item) => [item.x, item.y])
    )
  },
  // 直线
  LINE: (point, shape, buffer) => {
    const { x, y } = point
    const dx = shape.meta.x2 - shape.meta.x1
    const dy = shape.meta.y2 - shape.meta.y1
    const d = Math.sqrt(dx * dx + dy * dy)
    const cross = Math.abs((x - shape.meta.x1) * dy - (y - shape.meta.y1) * dx)
    const dist = cross / d
    return dist <= buffer
  },
  // 箭头直线
  ARROW_LINE: (point, shape, buffer) => {
    const { x, y } = point
    const dx = shape.meta.x2 - shape.meta.x1
    const dy = shape.meta.y2 - shape.meta.y1
    const d = Math.sqrt(dx * dx + dy * dy)
    const cross = Math.abs((x - shape.meta.x1) * dy - (y - shape.meta.y1) * dx)
    const dist = cross / d
    return dist <= buffer
  },
  // 点
  POINT: (point, shape, buffer) => {},
  // 多选
  MULTISELECT: (point, shape, buffer) => {},
  // 排除
  EXCLUSION: (point, shape, buffer) => {},
}

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
  POINT: "POINT", // 点
  MULTISELECT: "MULTISELECT", // 多选
  EXCLUSION: "EXCLUSION", // 排除
}

const state = reactive({
  transform: "", // svg 的定位
  tempShape: null, // 新增和编辑时的临时shape
  tools, // 支持的工具
  mode: tools.MOVE, // 绘图模式
  scale: 1, // 比例
  shapesBounds, // 形状数组对应边界的映射
})

let lastMouseDownTimestamp = 0 // 多边形工具下判断双击完成形状的时间戳
// 工具对应的鼠标处理函数
const toolsMouseMap = {
  // 移动
  [state.tools.MOVE]: {
    // 按下
    handleMouseDown: () => {
      if (isMouseOutside.value) {
        return
      }
      if (hoverShape.value) {
        state.tempShape = hoverShape.value
      }
    },
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
    handleMouseDown: () => {
      if (isMouseOutside.value) {
        return
      }
      const curMouseDownTimestamp = new Date().getTime()
      const diff = curMouseDownTimestamp - lastMouseDownTimestamp
      lastMouseDownTimestamp = curMouseDownTimestamp
      const clickPoint = isPolygonToolToStartPointTooClose.value
        ? state.tempShape.meta.points[0]
        : dziCoordByMouse.value
      const x = clickPoint.x
      const y = clickPoint.y
      const initPolygonShape = () => {
        state.tempShape = {
          id: null,
          type: state.tools.POLYGON,
          meta: {
            points: [
              {
                x,
                y,
              },
              {
                x,
                y,
              },
            ],
          },
        }
      }
      const completeShape = () => {
        state.tempShape.meta.points.pop()
        state.tempShape.id = new Date().getTime()
        emits("add", state.tempShape)
        state.tempShape = null
      }
      const addPoint = () => {
        for (const v of state.tempShape.meta.points.slice(
          0,
          state.tempShape.meta.points.length - 1
        )) {
          if (x === v.x && y === v.y) {
            return
          }
        }
        state.tempShape.meta.points.push({
          x,
          y,
        })
      }
      if (state.tempShape === null) {
        initPolygonShape()
      } else {
        // 如果离初始点靠的太近 直接完成
        if (
          state.tempShape.meta.points.length > 3 &&
          isPolygonToolToStartPointTooClose.value
        ) {
          completeShape()
        } else {
          addPoint()
        }
      }
      if (diff < 300) {
        lastMouseDownTimestamp = 0
        if (state.tempShape === null) {
          return
        }
        if (state.tempShape.meta.points.length > 3) {
          completeShape()
        }
      }
    },
    // 抬起
    handleMouseUp: () => {},
    // 移动
    handleMouseMove: () => {
      if (!state.tempShape) {
        return
      }
      if (isPolygonToolToStartPointTooClose.value) {
        state.tempShape.meta.points[state.tempShape.meta.points.length - 1] =
          state.tempShape.meta.points[0]
        return
      }
      state.tempShape.meta.points[state.tempShape.meta.points.length - 1] =
        dziCoordByMouse.value
    },
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
// 监听shapes的改变
const stringifyShapes = computed(() => {
  return JSON.stringify(props.shapes)
})
watch(
  stringifyShapes,
  (newData, oldData) => {
    const newVal = JSON.parse(newData)
    const oldVal = JSON.parse(oldData)
    const newIds = newVal.map((item) => item.id)
    const oldIds = oldVal.map((item) => item.id)
    const newIdsSet = new Set(newIds)
    const oldIdsSet = new Set(oldIds)
    const addIds = newIds.filter((item) => !oldIdsSet.has(item))
    const removeIds = oldIds.filter((item) => !newIdsSet.has(item))
    for (const v of addIds) {
      const item = newVal.filter((item) => item.id === v)[0]
      state.shapesBounds.insert(getBounds(item))
    }
    for (const v of removeIds) {
      const item = oldVal.filter((item) => item.id === v)[0]
      state.shapesBounds.remove(item, (a, b) => {
        return a.id === b.id
      })
    }
  },
  {
    deep: true,
  }
)
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

// 获取箭头的path
const getArrowPath = (shape) => {
  const startPoint = [shape.meta.x1, shape.meta.y1]
  const endPoint = [shape.meta.x2, shape.meta.y2]
  const angle = lineAngle([startPoint, endPoint])
  const referencePoint = [endPoint[0], endPoint[1] + 10]
  const pointA = pointRotate(referencePoint, angle + 90 + 30, endPoint)
  const pointB = pointRotate(referencePoint, angle + 90 - 30, endPoint)
  return `M${pointA[0]} ${pointA[1]} L${endPoint[0]} ${endPoint[1]} L${pointB[0]} ${pointB[1]}`
}

// 处理右键菜单
const handleContextmenu = (e) => {
  e.preventDefault()
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
    <strong>DEBUG</strong> <br />
    mouseX：{{ mouseX }} <br />
    mouseY：{{ mouseY }} <br />
    dziCoordByMouseX：{{ dziCoordByMouse.x }}<br />
    dziCoordByMouseY：{{ dziCoordByMouse.y }}<br />
    isMouseOutside：{{ isMouseOutside }}<br />
    isMousePressed：{{ isMousePressed }} <br />
    mouseSourceType：{{ mouseSourceType ?? "-" }} <br />
    hoverShapeId：{{ hoverShape?.id ?? "-" }}<br />
  </div>
  <svg
    ref="svgRef"
    :class="['painter', hoverShape ? 'CP' : '']"
    @contextmenu="handleContextmenu"
  >
    <g ref="svgRootGroupRef" :transform="state.transform">
      <!-- 普通形状 -->
      <g
        v-for="item in computedShapes"
        :key="item.id"
        :class="[
          `${item.type}_GROUP`,
          hoverShape?.id === item.id ? 'HOVER' : '',
        ]"
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
        <template v-if="state.tempShape.type === state.tools.POLYGON">
          <path
            :class="state.tempShape.type"
            :d="`M${state.tempShape.meta.points[0].x} ${
              state.tempShape.meta.points[0].y
            } ${state.tempShape.meta.points
              .slice(1)
              .map((pt) => `L${pt.x} ${pt.y} `)}`"
          ></path>
          <circle
            :class="[
              'POLYGON_APPENDAGE_ANCHOR',
              isPolygonToolToStartPointTooClose
                ? 'POLYGON_APPENDAGE_ANCHOR_LARGE'
                : '',
            ]"
            :cx="state.tempShape.meta.points[0].x"
            :cy="state.tempShape.meta.points[0].y"
            :transform="`scale(${1 / state.scale})`"
            :transform-origin="`${state.tempShape.meta.points[0].x} ${state.tempShape.meta.points[0].y}`"
          ></circle>
        </template>
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
        <template v-if="state.tempShape.type === state.tools.ARROW_LINE">
          <line
            v-if="state.tempShape.type === state.tools.ARROW_LINE"
            :class="state.tempShape.type"
            :x1="state.tempShape.meta.x1"
            :y1="state.tempShape.meta.y1"
            :x2="state.tempShape.meta.x2"
            :y2="state.tempShape.meta.y2"
          ></line>
          <path
            class="ARROW_LINE_APPENDAGE_ARROW"
            :d="getArrowPath(state.tempShape)"
            :transform="`scale(${1 / state.scale})`"
            :transform-origin="`${state.tempShape.meta.x2} ${state.tempShape.meta.y2}`"
          ></path>
        </template>
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
  bottom: 0;
  right: 0;
  border: 1px solid #ccc;
  background-color: #ddd;
  padding: 10px;
  z-index: 999;
  width: 400px;
}
.CP {
  cursor: pointer;
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
    // 附属箭头
    .ARROW_LINE_APPENDAGE_ARROW {
      stroke: #f00;
      stroke-width: 2px;
      fill: none;
    }
  }
  // 点
  .POINT_GROUP {
    .POINT {
      fill: rgba(255, 0, 0, 1);
      stroke: #fff;
      stroke-width: 1px;
      r: 5;
    }
  }
  // hover形状
  .HOVER {
    // 矩形
    .RECT {
      stroke-width: 3px;
    }
    // 多边形
    .POLYGON {
      stroke-width: 3px;
    }
    // 圆
    .CIRCLE {
      stroke-width: 3px;
    }
    // 椭圆
    .ELLIPSE {
      stroke-width: 3px;
    }
    // 路径
    .PATH {
      stroke-width: 3px;
    }
    // 闭合路径
    .CLOSED_PATH {
      stroke-width: 3px;
    }
    // 直线
    .LINE {
      stroke-width: 3px;
    }
    // 箭头直线
    .ARROW_LINE {
      stroke-width: 3px;
    }
    // 附属箭头
    .ARROW_LINE_APPENDAGE_ARROW {
      stroke-width: 3px;
    }
    // 点
    .POINT {
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
    // 附属锚点
    .POLYGON_APPENDAGE_ANCHOR {
      fill: rgba(255, 255, 0, 1);
      stroke: #fff;
      stroke-width: 1px;
      r: 5;
    }
    // 更大的附属锚点
    .POLYGON_APPENDAGE_ANCHOR_LARGE {
      r: 6;
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
    // 附属箭头
    .ARROW_LINE_APPENDAGE_ARROW {
      stroke: #f00;
      stroke-width: 2px;
      fill: none;
    }
    // 点
    .POINT {
      fill: rgba(255, 0, 0, 1);
      stroke: #fff;
      stroke-width: 1px;
      r: 5;
    }
  }
  // 编辑形状
  .EDIT_GROUP {
    // 锚点
    .ANCHOR {
      fill: rgba(255, 255, 0, 1);
      stroke: #fff;
      stroke-width: 1px;
      r: 5;
    }
    // 矩形
    .RECT {
      fill: rgba(255, 0, 0, 0.2);
      stroke: #f00;
      stroke-width: 2px;
    }
    // 多边形
    .POLYGON {
      fill: rgba(255, 0, 0, 0.2);
      stroke: #f00;
      stroke-width: 2px;
    }
    // 圆
    .CIRCLE {
      fill: rgba(255, 0, 0, 0.2);
      stroke: #f00;
      stroke-width: 2px;
    }
    // 椭圆
    .ELLIPSE {
      fill: rgba(255, 0, 0, 0.2);
      stroke: #f00;
      stroke-width: 2px;
    }
    // 路径
    .PATH {
      fill: rgba(255, 0, 0, 0.2);
      stroke: #f00;
      stroke-width: 2px;
    }
    // 闭合路径
    .CLOSED_PATH {
      fill: rgba(255, 0, 0, 0.2);
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
      fill: rgba(255, 255, 0, 1);
      stroke: #fff;
      stroke-width: 1px;
      r: 5;
    }
  }
}
</style>
