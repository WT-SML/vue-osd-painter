import painter from "./painter.vue"
import { createApp, h } from "vue"

const initPainter = (painterConf) => {
  const el = document.createElement("div")
  painterConf.viewer.canvas.appendChild(el)
  const app = createApp(h(painter, painterConf))
  const componentInstance = app.mount(el)
  componentInstance._app = app
  componentInstance.destroy = () => {
    app.unmount()
    el.remove()
  }
  return componentInstance
}

export default initPainter
