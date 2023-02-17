import vueOsdPainterComponent from "./vue-osd-painter.vue"
import { createApp, h, reactive } from "vue"

class vueOsdPainter {
  constructor(conf) {
    const viewer = conf.viewer
    const shapes = conf.shapes
    const tools = {
      // 移动
      MOVE: {
        name: "MOVE",
        status: 0,
      },
      //矩形
      RECT: {
        name: "RECT",
        status: 0,
      },
      // 多边形
      POLYGON: {
        name: "POLYGON",
        status: 0,
      },
      // 圆
      CIRCLE: {
        name: "CIRCLE",
        status: 0,
      },
      // 椭圆
      ELLIPSE: {
        name: "ELLIPSE",
        status: 0,
      },
      // 路径
      PATH: {
        name: "PATH",
        status: 0,
      },
      // 封闭路径
      CLOSED_PATH: {
        name: "CLOSED_PATH",
        status: 0,
      },
      // 直线
      LINE: {
        name: "LINE",
        status: 0,
      },
      // 箭头直线
      ARROW_LINE: {
        name: "ARROW_LINE",
        status: 0,
      },
      // 多选
      MULTISELECT: {
        name: "MULTISELECT",
        status: 0,
      },
      // 排除
      EXCLUSION: {
        name: "EXCLUSION",
        status: 0,
      },
    }
    this.state = reactive({
      viewer,
      shapes,
      tools: {
        list: tools,
        current: tools.MOVE.name,
      },
    })
    // 挂载组件
    this.mount()
  }

  // 挂载组件
  mount() {
    const el = document.createElement("div")
    this.state.viewer.canvas.appendChild(el)
    const props = {
      painter: this,
    }
    createApp(h(vueOsdPainterComponent, props)).mount(el)
  }
  // 销毁组件
  destroy() {
    // TODO:
  }
}

export { vueOsdPainter, vueOsdPainterComponent }

export default vueOsdPainter
