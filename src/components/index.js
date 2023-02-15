import vueOsdPainterComponent from "./vue-osd-painter.vue"
import { createApp, h, reactive } from "vue"

class vueOsdPainter {
  constructor(conf) {
    const viewer = conf.viewer
    const shapes = conf.shapes
    const tools = {
      MOVE: "MOVE", // 移动
      RECT: "RECT", //矩形
      POLYGON: "POLYGON", // 多边形
      CIRCLE: "CIRCLE", // 圆
      ELLIPSE: "ELLIPSE", // 椭圆
      PATH: "PATH", // 路径
      CLOSED_PATH: "CLOSED_PATH", // 封闭路径
      LINE: "LINE", // 直线
      ARROW_LINE: "ARROW_LINE", // 箭头直线
      MULTISELECT: "MULTISELECT", // 多选
      EXCLUSION: "EXCLUSION", // 排除
    }
    this.state = reactive({
      viewer,
      shapes,
      tools: {
        list: tools,
        current: tools.MOVE,
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
