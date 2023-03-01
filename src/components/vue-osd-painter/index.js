import painter from "./painter.vue"
import { createApp, h } from "vue"

const initPainter = (painterConf) => {
  const el = document.createElement("div")
  painterConf.viewer.canvas.appendChild(el)
  const app = createApp(h(painter, painterConf))
  return app.mount(el)
}

export default initPainter
