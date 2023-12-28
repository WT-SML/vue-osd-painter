<script setup>
// @ts-nocheck
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
import {
  createGlobalState,
  useMouseInElement,
  useMousePressed,
  onKeyStroke,
} from "@vueuse/core"
import { lineAngle, pointRotate, pointInPolygon, lineLength } from "geometric"
import RBush from "rbush"
import _ from "lodash"

const props = defineProps({
  viewer: Object, // osd 查看器
  shapes: Array, // 图形列表 支持响应式
  // 渲染器
  renderer: {
    type: String,
    default: "canvas",
  },
  // 巨量点标注模式
  enormousAmountPointsMode: {
    type: Boolean,
    default: false,
  },
})

const isCanvas = computed(() => props.renderer === "canvas")
const isEnormousAmountPointsMode = computed(
  () => props.enormousAmountPointsMode
)

const lineWidth = 2 // 边线宽度
const hoverLineWidth = 3 // 悬浮时边线宽度
const strokeStyle = "rgba(238, 120, 0, 1)" // 边线颜色
const hoverOrSelectedFillStyle = "rgba(238, 120, 0, 0.2)" // 悬浮或者选中时填充颜色
const anchorRadius = 5 // 锚点半径
const anchorRadiusLarge = 6 // 更大的锚点半径
const anchorFillStyle = "rgba(254, 220, 94, 1)" // 锚点填充颜色
const anchorStrokeStyle = "rgba(30, 39, 50, 1)" // 锚点边线颜色
const anchorLineWidth = 2 // 锚点边线宽度

onKeyStroke(["Delete"], async (e) => {
  switch (e.code) {
    case "Delete":
      if (state.tempShape && state.tempShape.id) {
        emits("remove", state.tempShape)
      }
      break
    default:
      break
  }
})

const emits = defineEmits(["add", "remove", "update"])

const canvasRef = ref(null)
const svgRef = ref(null)
const svgRootGroupRef = ref(null)

const {
  elementX: mouseX,
  elementY: mouseY,
  isOutside: isMouseOutside,
} = useMouseInElement(isCanvas.value ? canvasRef : svgRef)

const isLeftMousePressed = ref(false)

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
    lineLength([
      [state.tempShape.meta.points[0].x, state.tempShape.meta.points[0].y],
      [dziCoordByMouse.value.x, dziCoordByMouse.value.y],
    ]) <
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
  const shapes = [...computedShapes.value]
  if (state.tempShape && state.tempShape.id) {
    shapes.push(state.tempShape)
  }
  const detailedHitBounds = cursoryHitBounds.filter((bounds) => {
    const shape = shapes.find((item) => item.id === bounds.id)
    if (shape?.type === state.tools.POINT) {
      return true
    }
    return pointInShape({ x, y }, shape, buffer)
  })
  // 返回详细命中中的面积最小的那一个
  if (detailedHitBounds.length) {
    if (detailedHitBounds.length === 1) {
      return shapes.find((item) => item.id === detailedHitBounds[0].id)
    }
    detailedHitBounds.sort((a, b) => {
      const shapeA = shapes.find((item) => item.id === a.id)
      const shapeB = shapes.find((item) => item.id === b.id)
      return getShapeArea(shapeA) - getShapeArea(shapeB)
    })
    return shapes.find((item) => item.id === detailedHitBounds[0].id)
  }
  return null
})
// 编辑中的锚点列表
const editAnchors = computed(() => {
  if (!state.tempShape) {
    return null
  }
  if (!state.tempShape.id) {
    return null
  }
  const shapeGetAnchorsFuncMap = {
    // 矩形
    [state.tools.RECT]: (shape) => {
      return [
        // 左上
        { x: shape.meta.x, y: shape.meta.y },
        // 右上
        { x: shape.meta.x + shape.meta.width, y: shape.meta.y },
        // 左下
        { x: shape.meta.x, y: shape.meta.y + shape.meta.height },
        // 右下
        {
          x: shape.meta.x + shape.meta.width,
          y: shape.meta.y + shape.meta.height,
        },
      ]
    },
    // 多边形
    [state.tools.POLYGON]: (shape) => {
      return shape.meta.points
    },
    // 圆
    [state.tools.CIRCLE]: (shape) => {
      return [
        {
          x: state.tempShape.meta.cx + state.tempShape.meta.rx,
          y: state.tempShape.meta.cy,
        },
      ]
    },
    // 椭圆
    [state.tools.ELLIPSE]: (shape) => {
      return [
        {
          x: state.tempShape.meta.cx,
          y: state.tempShape.meta.cy - state.tempShape.meta.ry,
        },
        {
          x: state.tempShape.meta.cx + state.tempShape.meta.rx,
          y: state.tempShape.meta.cy,
        },
      ]
    },
    // 直线
    [state.tools.LINE]: (shape) => {
      return [
        { x: shape.meta.x1, y: shape.meta.y1 },
        { x: shape.meta.x2, y: shape.meta.y2 },
      ]
    },
    // 箭头直线
    [state.tools.ARROW_LINE]: (shape) => {
      return [
        { x: shape.meta.x1, y: shape.meta.y1 },
        { x: shape.meta.x2, y: shape.meta.y2 },
      ]
    },
  }
  if (shapeGetAnchorsFuncMap[state.tempShape.type]) {
    return shapeGetAnchorsFuncMap[state.tempShape.type](state.tempShape)
  }
  return null
})
// 悬浮的锚点
const hoverAnchor = computed(() => {
  if (!editAnchors.value) {
    return null
  }
  for (const v of editAnchors.value) {
    if (
      lineLength([
        [v.x, v.y],
        [dziCoordByMouse.value.x, dziCoordByMouse.value.y],
      ]) <
      (anchorRadius + 2) / state.scale
    ) {
      return v
    }
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
  if (!shape) {
    return false
  }
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
  // MULTISELECT: "MULTISELECT", // 多选
  // EXCLUSION: "EXCLUSION", // 排除
}

const setMode = (mode) => {
  state.mode = mode
}

const state = reactive({
  transform: "", // svg 的定位
  tempShape: null, // 新增和编辑时的临时shape
  tools, // 支持的工具
  mode: tools.MOVE, // 绘图模式
  scale: 1, // 比例
  shapesBounds, // 形状数组对应边界的映射
  translate: null, // svg的平移（基于视口）
  canvasTranslate: null, // canvas的平移（基于dzi）
})

let lastMouseDownTimestamp = 0 // 多边形工具下判断双击完成形状的时间戳
let tempCurMousePoint = null // 开始编辑前的鼠标位置
let tempShape = null // 开始编辑前形状的副本
let tempAnchor = null // 开始编辑前锚点的副本
// 工具对应的鼠标处理函数
const toolsMouseMap = {
  // 移动
  [state.tools.MOVE]: {
    // 按下
    handleMouseDown: () => {
      if (isMouseOutside.value) {
        return
      }
      const curMouseDownTimestamp = new Date().getTime()
      lastMouseDownTimestamp = curMouseDownTimestamp
      // 在锚点上按下
      if (state.tempShape && hoverAnchor.value) {
        props.viewer.setMouseNavEnabled(false)
        tempCurMousePoint = dziCoordByMouse.value
        tempAnchor = _.cloneDeep(hoverAnchor.value)
        tempShape = _.cloneDeep(state.tempShape)
        return
      }
      // 在编辑的shape上按下
      if (
        state.tempShape &&
        hoverShape.value &&
        state.tempShape.id === hoverShape.value.id
      ) {
        props.viewer.setMouseNavEnabled(false)
        tempCurMousePoint = dziCoordByMouse.value
        tempAnchor = null
        tempShape = _.cloneDeep(state.tempShape)
        return
      }
      tempCurMousePoint = null
      tempShape = null
      tempAnchor = null
      props.viewer.setMouseNavEnabled(true)
    },
    // 抬起
    handleMouseUp: () => {
      if (isMouseOutside.value) {
        return
      }
      const curMouseDownTimestamp = new Date().getTime()
      const diff = curMouseDownTimestamp - lastMouseDownTimestamp
      if (diff < 150) {
        // 短按
        // 短按了锚点
        if (hoverAnchor.value) {
          return
        }
        // 短按了形状
        if (hoverShape.value) {
          // 当前有编辑中的形状
          if (state.tempShape) {
            if (state.tempShape.id !== hoverShape.value.id) {
              const originalShape = props.shapes.find(
                (item) => item.id === state.tempShape.id
              )
              if (
                JSON.stringify(originalShape) !==
                JSON.stringify(state.tempShape)
              ) {
                emits("update", state.tempShape)
              }
              state.tempShape = _.cloneDeep(hoverShape.value)
            }
            // 当前没有编辑中的形状
          } else {
            state.tempShape = _.cloneDeep(hoverShape.value)
          }
          return
        }
        // 短按空白区域
        if (state.tempShape) {
          // 如果有临时shape则触发编辑保存
          const originalShape = props.shapes.find(
            (item) => item.id === state.tempShape.id
          )
          if (
            JSON.stringify(originalShape) !== JSON.stringify(state.tempShape)
          ) {
            emits("update", state.tempShape)
          }
          state.tempShape = null
        }
      } else {
        // 长按
      }
    },
    // 移动
    handleMouseMove: () => {
      // 在锚点上移动
      if (state.tempShape && tempAnchor && isLeftMousePressed.value) {
        const diff = {
          x: dziCoordByMouse.value.x - tempCurMousePoint.x,
          y: dziCoordByMouse.value.y - tempCurMousePoint.y,
        }
        const anchorHandleMoveFuncMap = {
          // 矩形
          [state.tools.RECT]: (shape, cloneShape, tempAnchor, diff) => {
            // 左上
            if (
              tempAnchor.x === cloneShape.meta.x &&
              tempAnchor.y === cloneShape.meta.y
            ) {
              if (diff.x < cloneShape.meta.width) {
                shape.meta.x = cloneShape.meta.x + diff.x
                shape.meta.width = cloneShape.meta.width - diff.x
              } else {
                shape.meta.x = cloneShape.meta.x + cloneShape.meta.width
                shape.meta.width = diff.x - cloneShape.meta.width
              }
              if (diff.y < cloneShape.meta.height) {
                shape.meta.y = cloneShape.meta.y + diff.y
                shape.meta.height = cloneShape.meta.height - diff.y
              } else {
                shape.meta.y = cloneShape.meta.y + cloneShape.meta.height
                shape.meta.height = diff.y - cloneShape.meta.height
              }
              return
            }
            // 右上
            if (
              tempAnchor.x === cloneShape.meta.x + cloneShape.meta.width &&
              tempAnchor.y === cloneShape.meta.y
            ) {
              if (diff.x < -cloneShape.meta.width) {
                shape.meta.x =
                  cloneShape.meta.x + cloneShape.meta.width + diff.x
                shape.meta.width = -diff.x - cloneShape.meta.width
              } else {
                shape.meta.width = cloneShape.meta.width + diff.x
              }
              if (diff.y > cloneShape.meta.height) {
                shape.meta.y = cloneShape.meta.y + cloneShape.meta.height
                shape.meta.height = diff.y - cloneShape.meta.height
              } else {
                shape.meta.y = cloneShape.meta.y + diff.y
                shape.meta.height = cloneShape.meta.height - diff.y
              }
              return
            }
            // 左下
            if (
              tempAnchor.x === cloneShape.meta.x &&
              tempAnchor.y === cloneShape.meta.y + cloneShape.meta.height
            ) {
              if (diff.x < cloneShape.meta.width) {
                shape.meta.x = cloneShape.meta.x + diff.x
                shape.meta.width = cloneShape.meta.width - diff.x
              } else {
                shape.meta.x = cloneShape.meta.x + cloneShape.meta.width
                shape.meta.width = diff.x - cloneShape.meta.width
              }
              if (-diff.y > cloneShape.meta.height) {
                shape.meta.y =
                  cloneShape.meta.y + cloneShape.meta.height + diff.y
                shape.meta.height = -diff.y - cloneShape.meta.height
              } else {
                shape.meta.height = cloneShape.meta.height + diff.y
              }
            }
            // 右下
            if (
              tempAnchor.x === cloneShape.meta.x + cloneShape.meta.width &&
              tempAnchor.y === cloneShape.meta.y + cloneShape.meta.height
            ) {
              if (diff.x < -cloneShape.meta.width) {
                shape.meta.x =
                  cloneShape.meta.x + cloneShape.meta.width + diff.x
                shape.meta.width = -diff.x - cloneShape.meta.width
              } else {
                shape.meta.width = cloneShape.meta.width + diff.x
              }
              if (-diff.y > cloneShape.meta.height) {
                shape.meta.y =
                  cloneShape.meta.y + cloneShape.meta.height + diff.y
                shape.meta.height = -diff.y - cloneShape.meta.height
              } else {
                shape.meta.height = cloneShape.meta.height + diff.y
              }
              return
            }
          },
          // 多边形
          [state.tools.POLYGON]: (shape, cloneShape, tempAnchor, diff) => {
            let i = 0
            for (const _i in cloneShape.meta.points) {
              const item = cloneShape.meta.points[_i]
              if (item.x === tempAnchor.x && item.y === tempAnchor.y) {
                i = Number(_i)
              }
            }
            shape.meta.points[i].x = tempAnchor.x + diff.x
            shape.meta.points[i].y = tempAnchor.y + diff.y
          },
          // 圆
          [state.tools.CIRCLE]: (shape, cloneShape, tempAnchor, diff) => {
            const ret = Math.max(cloneShape.meta.rx + diff.x, 1)
            shape.meta.rx = ret
            shape.meta.ry = ret
          },
          // 椭圆
          [state.tools.ELLIPSE]: (shape, cloneShape, tempAnchor, diff) => {
            // 上边的点
            if (
              tempAnchor.x === cloneShape.meta.cx &&
              tempAnchor.y === cloneShape.meta.cy - cloneShape.meta.ry
            ) {
              const ret = Math.max(cloneShape.meta.ry - diff.y, 1)
              shape.meta.ry = ret
              return
            }
            // 右边的点
            if (
              tempAnchor.x === cloneShape.meta.cx + cloneShape.meta.rx &&
              tempAnchor.y === cloneShape.meta.cy
            ) {
              const ret = Math.max(cloneShape.meta.rx + diff.x, 1)
              shape.meta.rx = ret
              return
            }
          },
          // 直线
          [state.tools.LINE]: (shape, cloneShape, tempAnchor, diff) => {
            // 起始点
            if (
              tempAnchor.x === cloneShape.meta.x1 &&
              tempAnchor.y === cloneShape.meta.y1
            ) {
              shape.meta.x1 = cloneShape.meta.x1 + diff.x
              shape.meta.y1 = cloneShape.meta.y1 + diff.y
              return
            }
            // 结束点
            if (
              tempAnchor.x === cloneShape.meta.x2 &&
              tempAnchor.y === cloneShape.meta.y2
            ) {
              shape.meta.x2 = cloneShape.meta.x2 + diff.x
              shape.meta.y2 = cloneShape.meta.y2 + diff.y
              return
            }
          },
          // 箭头直线
          [state.tools.ARROW_LINE]: (shape, cloneShape, tempAnchor, diff) => {
            // 起始点
            if (
              tempAnchor.x === cloneShape.meta.x1 &&
              tempAnchor.y === cloneShape.meta.y1
            ) {
              shape.meta.x1 = cloneShape.meta.x1 + diff.x
              shape.meta.y1 = cloneShape.meta.y1 + diff.y
              return
            }
            // 结束点
            if (
              tempAnchor.x === cloneShape.meta.x2 &&
              tempAnchor.y === cloneShape.meta.y2
            ) {
              shape.meta.x2 = cloneShape.meta.x2 + diff.x
              shape.meta.y2 = cloneShape.meta.y2 + diff.y
              return
            }
          },
        }
        anchorHandleMoveFuncMap[state.tempShape.type](
          state.tempShape,
          tempShape,
          tempAnchor,
          diff
        )
        return
      }
      // 在编辑的shape上移动
      if (state.tempShape && tempShape && isLeftMousePressed.value) {
        const diff = {
          x: dziCoordByMouse.value.x - tempCurMousePoint.x,
          y: dziCoordByMouse.value.y - tempCurMousePoint.y,
        }
        const shapeHandleMoveFuncMap = {
          // 矩形
          [state.tools.RECT]: (shape, cloneShape, diff) => {
            shape.meta.x = cloneShape.meta.x + diff.x
            shape.meta.y = cloneShape.meta.y + diff.y
          },
          // 多边形
          [state.tools.POLYGON]: (shape, cloneShape, diff) => {
            shape.meta.points = cloneShape.meta.points.map((item) => ({
              x: item.x + diff.x,
              y: item.y + diff.y,
            }))
          },
          // 圆
          [state.tools.CIRCLE]: (shape, cloneShape, diff) => {
            shape.meta.cx = cloneShape.meta.cx + diff.x
            shape.meta.cy = cloneShape.meta.cy + diff.y
          },
          // 椭圆
          [state.tools.ELLIPSE]: (shape, cloneShape, diff) => {
            shape.meta.cx = cloneShape.meta.cx + diff.x
            shape.meta.cy = cloneShape.meta.cy + diff.y
          },
          // 路径
          [state.tools.PATH]: (shape, cloneShape, diff) => {
            shape.meta.d = cloneShape.meta.d.map((item) => ({
              x: item.x + diff.x,
              y: item.y + diff.y,
            }))
          },
          // 闭合路径
          [state.tools.CLOSED_PATH]: (shape, cloneShape, diff) => {
            shape.meta.d = cloneShape.meta.d.map((item) => ({
              x: item.x + diff.x,
              y: item.y + diff.y,
            }))
          },
          // 直线
          [state.tools.LINE]: (shape, cloneShape, diff) => {
            shape.meta.x1 = cloneShape.meta.x1 + diff.x
            shape.meta.x2 = cloneShape.meta.x2 + diff.x
            shape.meta.y1 = cloneShape.meta.y1 + diff.y
            shape.meta.y2 = cloneShape.meta.y2 + diff.y
          },
          // 箭头直线
          [state.tools.ARROW_LINE]: (shape, cloneShape, diff) => {
            shape.meta.x1 = cloneShape.meta.x1 + diff.x
            shape.meta.x2 = cloneShape.meta.x2 + diff.x
            shape.meta.y1 = cloneShape.meta.y1 + diff.y
            shape.meta.y2 = cloneShape.meta.y2 + diff.y
          },
          // 点
          [state.tools.POINT]: (shape, cloneShape, diff) => {
            shape.meta.cx = cloneShape.meta.cx + diff.x
            shape.meta.cy = cloneShape.meta.cy + diff.y
          },
        }
        shapeHandleMoveFuncMap[state.tempShape.type](
          state.tempShape,
          tempShape,
          diff
        )
        return
      }
    },
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
        type: state.tools.ELLIPSE,
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
    const updateIds = newIds.filter((item) => {
      if (addIds.includes(item) || removeIds.includes(item)) {
        return false
      }
      const oldItem = oldVal.filter((_item) => _item.id === item)[0]
      const newItem = newVal.filter((_item) => _item.id === item)[0]
      return JSON.stringify(oldItem) !== JSON.stringify(newItem)
    })
    for (const v of addIds) {
      const item = newVal.filter((item) => item.id === v)[0]
      state.shapesBounds.insert(getBounds(item))
    }
    for (const v of removeIds) {
      const item = oldVal.filter((item) => item.id === v)[0]
      state.shapesBounds.remove(item, (a, b) => {
        return a.id === b.id
      })
      if (state.tempShape && state.tempShape.id === item.id) {
        state.tempShape = null
      }
    }
    for (const v of updateIds) {
      const newItem = newVal.filter((item) => item.id === v)[0]
      state.shapesBounds.remove(newItem, (a, b) => {
        return a.id === b.id
      })
      state.shapesBounds.insert(getBounds(newItem))
    }
    updateTransform()
  },
  {
    deep: true,
  }
)
// 监听临时shape
watch(
  () => state.tempShape,
  () => {
    if (state.tempShape && state.tempShape.id) {
      state.shapesBounds.remove(state.tempShape, (a, b) => {
        return a.id === b.id
      })
      state.shapesBounds.insert(getBounds(state.tempShape))
    }
  },
  { deep: true }
)
// 监听hoverShape
watch(
  hoverShape,
  () => {
    updateTransform()
  },
  { deep: true }
)
// 监听临时shape
watch(
  () => state.tempShape,
  () => {
    updateTransform()
  },
  { deep: true }
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
watch(isLeftMousePressed, (newVal) => {
  if (newVal) {
    toolsMouseMap[state.mode].handleMouseDown()
  } else {
    toolsMouseMap[state.mode].handleMouseUp()
  }
  updateTransform()
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
  state.translate = p
  const canvasP = props.viewer.viewport.viewerElementToImageCoordinates(
    new osd.Point(0, 0)
  )
  state.canvasTranslate = canvasP
  state.transform = `translate(${p.x}, ${p.y}) scale(${scaleX}, ${scaleY}) rotate(${rotation})`
  if (isCanvas.value) {
    render()
  }
}
const pointsToPath2D = (points, isClose = false) => {
  const path = new Path2D()
  for (const i in points) {
    const point = points[i]
    if (Number(i) === 0) {
      path.moveTo(point.x, point.y)
    } else {
      path.lineTo(point.x, point.y)
    }
  }
  if (isClose) path.closePath()
  return path
}
// 渲染图形
const drawShape = (ctx, shape, isAdd = false) => {
  if (shape.type === state.tools.POINT) {
    ctx.lineWidth = anchorLineWidth / state.scale
    ctx.strokeStyle = anchorStrokeStyle
    if (state.tempShape?.id === shape.id) {
      ctx.fillStyle = anchorFillStyle
    } else {
      ctx.fillStyle = strokeStyle
    }
  } else {
    ctx.lineWidth =
      (hoverShape.value?.id === shape.id ? hoverLineWidth : lineWidth) /
      state.scale
    ctx.strokeStyle = strokeStyle
    if (state.tempShape?.id === shape.id || hoverShape.value?.id === shape.id) {
      ctx.fillStyle = hoverOrSelectedFillStyle
    } else {
      ctx.fillStyle = null
    }
  }
  if (shape.type === state.tools.RECT) {
    // 矩形
    const { x, y, width, height } = shape.meta
    ctx.strokeRect(x, y, width, height)
    if (state.tempShape?.id === shape.id || hoverShape.value?.id === shape.id) {
      ctx.fillRect(x, y, width, height)
    }
  } else if (shape.type === state.tools.POLYGON) {
    // 多边形
    const { points } = shape.meta
    ctx.stroke(pointsToPath2D(points, !isAdd))
    if (state.tempShape?.id === shape.id || hoverShape.value?.id === shape.id) {
      ctx.fill(pointsToPath2D(points))
    }
  } else if (shape.type === state.tools.CIRCLE) {
    // 圆
    const { cx, cy, rx, ry } = shape.meta
    ctx.beginPath()
    ctx.arc(cx, cy, rx, 0, Math.PI * 2)
    ctx.closePath()
    ctx.stroke()
    if (state.tempShape?.id === shape.id || hoverShape.value?.id === shape.id) {
      ctx.fill()
    }
  } else if (shape.type === state.tools.ELLIPSE) {
    // 椭圆
    const { cx, cy, rx, ry } = shape.meta
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2, false)
    ctx.stroke()
    if (state.tempShape?.id === shape.id || hoverShape.value?.id === shape.id) {
      ctx.fill()
    }
  } else if (shape.type === state.tools.PATH) {
    // 路径
    const { d } = shape.meta
    ctx.stroke(pointsToPath2D(d))
    if (state.tempShape?.id === shape.id || hoverShape.value?.id === shape.id) {
      ctx.fill(pointsToPath2D(d))
    }
  } else if (shape.type === state.tools.CLOSED_PATH) {
    // 闭合路径
    const { d } = shape.meta
    ctx.stroke(pointsToPath2D(d, !isAdd))
    if (state.tempShape?.id === shape.id || hoverShape.value?.id === shape.id) {
      ctx.fill(pointsToPath2D(d))
    }
  } else if (shape.type === state.tools.LINE) {
    // 直线
    const { x1, y1, x2, y2 } = shape.meta
    const points = [
      {
        x: x1,
        y: y1,
      },
      {
        x: x2,
        y: y2,
      },
    ]
    ctx.stroke(pointsToPath2D(points))
  } else if (shape.type === state.tools.ARROW_LINE) {
    // 箭头直线
    const { x1, y1, x2, y2 } = shape.meta
    const points = [
      {
        x: x1,
        y: y1,
      },
      {
        x: x2,
        y: y2,
      },
    ]
    ctx.stroke(pointsToPath2D(points))
    ctx.stroke(pointsToPath2D(getArrowPathForCanvas(shape, state.scale)))
  } else if (shape.type === state.tools.POINT) {
    const { cx, cy } = shape.meta
    // 点
    if (isEnormousAmountPointsMode.value) {
      // 如果是巨量点标注模式
      const width = Math.floor((anchorRadius * 2) / state.scale)
      const height = Math.floor((anchorRadius * 2) / state.scale)
      ctx.fillRect(
        Math.floor(cx - width / 2),
        Math.floor(cy - height / 2),
        width,
        height
      )
    } else {
      ctx.beginPath()
      ctx.arc(
        cx,
        cy,
        (hoverShape.value?.id === shape.id ? anchorRadiusLarge : anchorRadius) /
          state.scale,
        0,
        2 * Math.PI
      )
      ctx.closePath()
      ctx.stroke()
      ctx.fill()
    }
  }
}
// 渲染编辑锚点
const drawEditAnchors = (ctx) => {
  if (!editAnchors.value) return
  for (const v of editAnchors.value) {
    const { x, y } = v
    ctx.lineWidth = anchorLineWidth / state.scale
    ctx.strokeStyle = anchorStrokeStyle
    ctx.fillStyle = anchorFillStyle
    ctx.beginPath()
    ctx.arc(x, y, anchorRadius / state.scale, 0, 2 * Math.PI)
    ctx.closePath()
    ctx.stroke()
    ctx.fill()
  }
}
// canvas 渲染
const render = () => {
  const viewer = props.viewer
  const viewport = viewer.viewport
  const canvas = canvasRef.value
  if (!canvas) {
    return
  }
  const viewportContainerSize = viewer.viewport.getContainerSize()
  const canvasWidth = viewportContainerSize.x
  const canvasHeight = viewportContainerSize.y
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext("2d")
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const flipped = viewport.getFlip()
  const scaleY = state.scale
  const scaleX = flipped ? -scaleY : scaleY
  ctx.scale(scaleY, scaleX)
  ctx.translate(-state.canvasTranslate.x, -state.canvasTranslate.y)
  // 渲染普通形状
  for (const shape of computedShapes.value) {
    drawShape(ctx, shape)
  }
  // 渲染新增形状
  if (state.tempShape?.id === null) {
    drawShape(ctx, state.tempShape, true)
    if (state.tempShape.type === state.tools.POLYGON) {
      // 闭合提示锚点
      ctx.lineWidth = anchorLineWidth / scaleY
      ctx.strokeStyle = anchorStrokeStyle
      ctx.fillStyle = anchorFillStyle
      ctx.beginPath()
      ctx.arc(
        state.tempShape.meta.points[0].x,
        state.tempShape.meta.points[0].y,

        (isPolygonToolToStartPointTooClose.value
          ? anchorRadiusLarge
          : anchorRadius) / scaleY,
        0,
        2 * Math.PI
      )
      ctx.closePath()
      ctx.stroke()
      ctx.fill()
    }
  }
  // 渲染编辑形状
  if (state.tempShape?.id) {
    drawShape(ctx, state.tempShape)
    drawEditAnchors(ctx)
  }
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
// 获取箭头的path （canvas专属）
const getArrowPathForCanvas = (shape, scale) => {
  const startPoint = [shape.meta.x1, shape.meta.y1]
  const endPoint = [shape.meta.x2, shape.meta.y2]
  const angle = lineAngle([startPoint, endPoint])
  const referencePoint = [endPoint[0], endPoint[1] + 10 / scale]
  const pointA = pointRotate(referencePoint, angle + 90 + 30, endPoint)
  const pointB = pointRotate(referencePoint, angle + 90 - 30, endPoint)
  return [
    {
      x: pointA[0],
      y: pointA[1],
    },
    {
      x: endPoint[0],
      y: endPoint[1],
    },
    {
      x: pointB[0],
      y: pointB[1],
    },
  ]
}
// 处理右键菜单
const handleContextmenu = (e) => {
  e.preventDefault()
}
// 挂载
onMounted(() => {
  updateTransform()
  listenForViewerEvents()
  // 创建一个鼠标跟踪器
  const tracker = new osd.MouseTracker({
    element: isCanvas.value ? canvasRef.value : svgRef.value,
    pressHandler: (e) => {
      isLeftMousePressed.value = true
    },
    releaseHandler: (e) => {
      isLeftMousePressed.value = false
    },
    moveHandler: (e) => {
      mouseX.value = e.position.x
      mouseY.value = e.position.y
    },
  })
  // 启用鼠标跟踪器
  tracker.setTracking(true)
})
// 卸载
onUnmounted(() => {})
// 调试信息
const debug = {
  mouseX,
  mouseY,
  dziCoordByMouse,
  isMouseOutside,
  isLeftMousePressed,
  hoverShape,
  hoverAnchor,
}
// 移动到某个标注
const panTo = (shape) => {
  const bounds = getBounds(shape)
  const center = {
    x: (bounds.maxX + bounds.minX) / 2,
    y: (bounds.maxY + bounds.minY) / 2,
  }
  props.viewer.viewport.panTo(
    props.viewer.viewport.imageToViewportCoordinates(center.x, center.y)
  )
}
// 选中shape
const select = (shape) => {
  state.tempShape = _.cloneDeep(shape)
}
// 暴露数据
defineExpose({
  state,
  tools,
  debug,
  setMode,
  panTo,
  select,
})
</script>

<template>
  <canvas
    v-if="isCanvas"
    ref="canvasRef"
    :class="['canvas-painter', hoverShape || hoverAnchor ? 'CP' : '']"
    @contextmenu="handleContextmenu"
  ></canvas>
  <svg
    v-else
    ref="svgRef"
    :class="['painter', hoverShape || hoverAnchor ? 'CP' : '']"
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
      <g
        :class="[
          `EDIT_GROUP`,
          hoverShape?.id === state.tempShape?.id ? 'HOVER' : '',
        ]"
        v-if="state.tempShape?.id"
      >
        <!-- 矩形 -->
        <template v-if="state.tempShape.type === state.tools.RECT">
          <!-- 本体 -->
          <rect
            v-if="state.tempShape.type === state.tools.RECT"
            :class="state.tempShape.type"
            :x="state.tempShape.meta.x"
            :y="state.tempShape.meta.y"
            :width="state.tempShape.meta.width"
            :height="state.tempShape.meta.height"
          ></rect>
          <!-- 锚点 -->
          <circle
            v-for="(item, i) in editAnchors"
            :key="i"
            class="ANCHOR"
            :cx="item.x"
            :cy="item.y"
            :transform="`scale(${1 / state.scale})`"
            :transform-origin="`${item.x} ${item.y}`"
          ></circle>
        </template>
        <!-- 多边形 -->
        <template v-if="state.tempShape.type === state.tools.POLYGON">
          <!-- 本体 -->
          <path
            :class="state.tempShape.type"
            :d="`M${state.tempShape.meta.points[0].x} ${
              state.tempShape.meta.points[0].y
            } ${state.tempShape.meta.points
              .slice(1)
              .map((pt) => `L${pt.x} ${pt.y} `)}Z`"
          ></path>
          <!-- 锚点 -->
          <circle
            v-for="(item, i) in editAnchors"
            :key="i"
            class="ANCHOR"
            :cx="item.x"
            :cy="item.y"
            :transform="`scale(${1 / state.scale})`"
            :transform-origin="`${item.x} ${item.y}`"
          ></circle>
        </template>
        <!-- 圆 -->
        <template v-if="state.tempShape.type === state.tools.CIRCLE">
          <!-- 本体 -->
          <ellipse
            :class="state.tempShape.type"
            :cx="state.tempShape.meta.cx"
            :cy="state.tempShape.meta.cy"
            :rx="state.tempShape.meta.rx"
            :ry="state.tempShape.meta.ry"
          ></ellipse>
          <!-- 锚点 -->
          <circle
            v-for="(item, i) in editAnchors"
            :key="i"
            class="ANCHOR"
            :cx="item.x"
            :cy="item.y"
            :transform="`scale(${1 / state.scale})`"
            :transform-origin="`${item.x} ${item.y}`"
          ></circle>
        </template>
        <!-- 椭圆 -->
        <template v-if="state.tempShape.type === state.tools.ELLIPSE">
          <!-- 本体 -->
          <ellipse
            :class="state.tempShape.type"
            :cx="state.tempShape.meta.cx"
            :cy="state.tempShape.meta.cy"
            :rx="state.tempShape.meta.rx"
            :ry="state.tempShape.meta.ry"
          ></ellipse>
          <!-- 锚点 -->
          <circle
            v-for="(item, i) in editAnchors"
            :key="i"
            class="ANCHOR"
            :cx="item.x"
            :cy="item.y"
            :transform="`scale(${1 / state.scale})`"
            :transform-origin="`${item.x} ${item.y}`"
          ></circle>
        </template>
        <!-- 路径 -->
        <template v-if="state.tempShape.type === state.tools.PATH">
          <!-- 本体 -->
          <path
            :class="state.tempShape.type"
            :d="`M${state.tempShape.meta.d[0].x} ${
              state.tempShape.meta.d[0].y
            } ${state.tempShape.meta.d
              .slice(1)
              .map((pt) => `L${pt.x} ${pt.y} `)}`"
          ></path>
        </template>
        <!-- 闭合路径 -->
        <template v-if="state.tempShape.type === state.tools.CLOSED_PATH">
          <!-- 本体 -->
          <path
            :class="state.tempShape.type"
            :d="`M${state.tempShape.meta.d[0].x} ${
              state.tempShape.meta.d[0].y
            } ${state.tempShape.meta.d
              .slice(1)
              .map((pt) => `L${pt.x} ${pt.y} `)} Z`"
          ></path>
        </template>
        <!-- 直线 -->
        <template v-if="state.tempShape.type === state.tools.LINE">
          <!-- 本体 -->
          <line
            :class="state.tempShape.type"
            :x1="state.tempShape.meta.x1"
            :y1="state.tempShape.meta.y1"
            :x2="state.tempShape.meta.x2"
            :y2="state.tempShape.meta.y2"
          ></line>
          <!-- 锚点 -->
          <circle
            v-for="(item, i) in editAnchors"
            :key="i"
            class="ANCHOR"
            :cx="item.x"
            :cy="item.y"
            :transform="`scale(${1 / state.scale})`"
            :transform-origin="`${item.x} ${item.y}`"
          ></circle>
        </template>
        <!-- 箭头直线 -->
        <template v-if="state.tempShape.type === state.tools.ARROW_LINE">
          <!-- 本体 -->
          <line
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
          <!-- 锚点 -->
          <circle
            v-for="(item, i) in editAnchors"
            :key="i"
            class="ANCHOR"
            :cx="item.x"
            :cy="item.y"
            :transform="`scale(${1 / state.scale})`"
            :transform-origin="`${item.x} ${item.y}`"
          ></circle>
        </template>
        <!-- 点 -->
        <template v-if="state.tempShape.type === state.tools.POINT">
          <!-- 本体 -->
          <circle
            :class="state.tempShape.type"
            :cx="state.tempShape.meta.cx"
            :cy="state.tempShape.meta.cy"
            :transform="`scale(${1 / state.scale})`"
            :transform-origin="`${state.tempShape.meta.cx} ${state.tempShape.meta.cy}`"
          ></circle>
        </template>
      </g>
    </g>
  </svg>
</template>

<style lang="scss" scoped>
.CP {
  cursor: pointer;
}
.canvas-painter {
  position: absolute;
  top: 0;
  left: 0;
  user-select: none;
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
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
  }
  // 多边形
  .POLYGON_GROUP {
    .POLYGON {
      fill: none;
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
  }
  // 圆
  .CIRCLE_GROUP {
    .CIRCLE {
      fill: none;
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
  }
  // 椭圆
  .ELLIPSE_GROUP {
    .ELLIPSE {
      fill: none;
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
  }
  // 路径
  .PATH_GROUP {
    .PATH {
      fill: none;
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
  }
  // 闭合路径
  .CLOSED_PATH_GROUP {
    .CLOSED_PATH {
      fill: none;
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
  }
  // 直线
  .LINE_GROUP {
    .LINE {
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
  }
  // 箭头直线
  .ARROW_LINE_GROUP {
    .ARROW_LINE {
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 附属箭头
    .ARROW_LINE_APPENDAGE_ARROW {
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
      fill: none;
    }
  }
  // 点
  .POINT_GROUP {
    .POINT {
      fill: v-bind(strokeStyle);
      stroke: v-bind(anchorStrokeStyle);
      stroke-width: v-bind(anchorLineWidth);
      r: v-bind(anchorRadius);
    }
  }

  // 新增形状
  .ADD_GROUP {
    // 矩形
    .RECT {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 多边形
    .POLYGON {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 附属锚点
    .POLYGON_APPENDAGE_ANCHOR {
      fill: v-bind(anchorFillStyle);
      stroke: v-bind(anchorStrokeStyle);
      stroke-width: v-bind(anchorLineWidth);
      r: v-bind(anchorRadius);
    }
    // 更大的附属锚点
    .POLYGON_APPENDAGE_ANCHOR_LARGE {
      r: v-bind(anchorRadiusLarge);
    }
    // 圆
    .CIRCLE {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 椭圆
    .ELLIPSE {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 路径
    .PATH {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 闭合路径
    .CLOSED_PATH {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 直线
    .LINE {
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 箭头直线
    .ARROW_LINE {
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 附属箭头
    .ARROW_LINE_APPENDAGE_ARROW {
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
      fill: none;
    }
    // 点
    .POINT {
      fill: v-bind(strokeStyle);
      stroke: v-bind(anchorStrokeStyle);
      stroke-width: v-bind(anchorLineWidth);
      r: v-bind(anchorRadius);
    }
  }
  // 编辑形状
  .EDIT_GROUP {
    // 锚点
    .ANCHOR {
      fill: v-bind(anchorFillStyle);
      stroke: v-bind(anchorStrokeStyle);
      stroke-width: v-bind(anchorLineWidth);
      r: v-bind(anchorRadius);
    }
    // 矩形
    .RECT {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 多边形
    .POLYGON {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 圆
    .CIRCLE {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 椭圆
    .ELLIPSE {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 路径
    .PATH {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 闭合路径
    .CLOSED_PATH {
      fill: v-bind(hoverOrSelectedFillStyle);
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 直线
    .LINE {
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    // 箭头直线
    .ARROW_LINE {
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
    }
    .ARROW_LINE_APPENDAGE_ARROW {
      stroke: v-bind(strokeStyle);
      stroke-width: v-bind(lineWidth);
      fill: none;
    }
    // 点
    .POINT {
      fill: v-bind(anchorFillStyle);
      stroke: v-bind(anchorStrokeStyle);
      stroke-width: v-bind(anchorLineWidth);
      r: v-bind(anchorRadius);
    }
  }
  // hover形状
  .HOVER {
    // 矩形
    .RECT {
      stroke-width: v-bind(hoverLineWidth);
    }
    // 多边形
    .POLYGON {
      stroke-width: v-bind(hoverLineWidth);
    }
    // 圆
    .CIRCLE {
      stroke-width: v-bind(hoverLineWidth);
    }
    // 椭圆
    .ELLIPSE {
      stroke-width: v-bind(hoverLineWidth);
    }
    // 路径
    .PATH {
      stroke-width: v-bind(hoverLineWidth);
    }
    // 闭合路径
    .CLOSED_PATH {
      stroke-width: v-bind(hoverLineWidth);
    }
    // 直线
    .LINE {
      stroke-width: v-bind(hoverLineWidth);
    }
    // 箭头直线
    .ARROW_LINE {
      stroke-width: v-bind(hoverLineWidth);
    }
    // 附属箭头
    .ARROW_LINE_APPENDAGE_ARROW {
      stroke-width: v-bind(hoverLineWidth);
    }
    // 点
    .POINT {
      r: v-bind(anchorRadiusLarge);
    }
  }
}
</style>
