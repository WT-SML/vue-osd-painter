<script setup>
// @ts-nocheck
import osd from "openseadragon"
import { onMounted, reactive, ref, computed } from "vue"
import initPainter from "./components/vue-osd-painter"
import { defaultShapes } from "./tools/default-shapes"
import { defaultOsdConf } from "./tools/default-osd-conf"
import { randomPoints } from "./tools"
import _ from "lodash"

const osdRef = ref(null) // osd dom

// 模式和描述的映射
const modeDescMap = computed(() => {
  if (!state.painter) return {}
  return {
    [state.painter.tools.MOVE]: "移动",
    [state.painter.tools.RECT]: "矩形",
    [state.painter.tools.POLYGON]: "多边形",
    [state.painter.tools.CIRCLE]: "圆",
    [state.painter.tools.ELLIPSE]: "椭圆",
    [state.painter.tools.PATH]: "路径",
    [state.painter.tools.CLOSED_PATH]: "闭合路径",
    [state.painter.tools.LINE]: "直线",
    [state.painter.tools.ARROW_LINE]: "箭头直线",
    [state.painter.tools.POINT]: "点",
  }
})

const state = reactive({
  viewer: null, // osd 查看器
  painter: null, // 画家对象
  shapes: [], // 图形列表
  enormousAmountPointsMode: false, // 巨量点标注模式
})

// 清空画布
const clear = () => {
  state.shapes.length = 0
}
// 开启巨量点标注模式
const openEnormousAmountPointsMode = () => {
  clear()
  state.enormousAmountPointsMode = true
  // 重置painter
  resetPainter()
  random10000Points()
}
// 随机生成10000个点标注
const random10000Points = () => {
  clear()
  const points = randomPoints(state.viewer, 1000)
  state.shapes.push(...points)
}
// 回到普通模式
const backToNormalMode = () => {
  clear()
  state.enormousAmountPointsMode = false
  // 重置painter
  resetPainter()
  state.shapes.push(..._.cloneDeep(defaultShapes))
}
// 重置painter
const resetPainter = () => {
  // 销毁
  state.painter.destroy()
  // 重新初始化
  initializePainter()
}
// 初始化painter
const initializePainter = () => {
  // 秉承 vue 的思想，painter 的 shapes（要渲染的形状数组） 配置应该是响应式的数据，如此一来，你可以直接操作 shapes 数组，进而画布上的形状会随之更新
  const painterConf = {
    viewer: state.viewer, // osd 查看器
    shapes: state.shapes, // 图形列表
    renderer: "canvas", // 渲染器：canvas or svg
    // renderer: "svg", // 渲染器：canvas or svg
    enormousAmountPointsMode: state.enormousAmountPointsMode, // 是否开启巨量点标注模式（渲染器为canvas才支持，svg下不生效）
    // 监听新增形状
    onAdd: (shape) => {
      state.shapes.push(shape)
    },
    // 监听删除形状
    onRemove: (shape) => {
      for (const i in state.shapes) {
        if (state.shapes[i].id === shape.id) {
          state.shapes.splice(i, 1)
        }
      }
    },
    // 监听更新形状
    onUpdate: (shape) => {
      for (const k in state.shapes) {
        if (state.shapes[k].id === shape.id) {
          state.shapes[k] = shape
        }
      }
    },
  }
  // 返回的 painter 是该 vue 组件的组件实例，你可以访问该组件实例上的 props、refs 等属性，当然，我也把该组件的 state 暴露给了你，以供你灵活的进行开发
  state.painter = initPainter(painterConf)
}
// 初始化osd
const initializeOsd = () => {
  const tileSources =
    "http://openseadragon.github.io/example-images/duomo/duomo.dzi"
  const osdConf = {
    ..._.cloneDeep(defaultOsdConf),
    element: osdRef.value,
    tileSources, // 瓦片源
  }
  state.viewer = new osd.Viewer(osdConf)
}
onMounted(async () => {
  // 初始化osd
  initializeOsd()
  state.viewer.addHandler("open", () => {
    // 初始化为 1 倍
    state.viewer.viewport.zoomTo(1)
    // 初始化 painter
    initializePainter()
    // 渲染默认的 shapes
    state.shapes.push(..._.cloneDeep(defaultShapes))
  })
})
</script>

<template>
  <div class="container">
    <div class="header">
      <div class="left-title">
        <img src="/favicon.ico" class="logo" />
        <span>Vue Osd Painter</span>
      </div>
      <a
        href="https://github.com/WT-SML/vue-osd-painter"
        target="_blank"
        class="github"
      >
        <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <title>GitHub</title>
          <path
            d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
          ></path>
        </svg>
      </a>
    </div>
    <div class="main">
      <div class="tools">
        <div v-if="state.painter" class="">
          <div class="tools-list">
            <div class="mode-title">模式：</div>
            <label
              v-for="(v, k) in state.painter.tools"
              :key="k"
              :for="k"
              class="item"
            >
              <input
                :id="k"
                type="radio"
                :value="k"
                v-model="state.painter.state.mode"
              />
              {{ modeDescMap[k] || k }}
            </label>
          </div>
          <div class="btns">
            <button
              class="btn"
              v-if="!state.enormousAmountPointsMode"
              @click="openEnormousAmountPointsMode()"
            >
              开启巨量点标注模式
            </button>
            <button
              class="btn"
              v-if="state.enormousAmountPointsMode"
              @click="backToNormalMode()"
            >
              回到普通模式
            </button>
            <button
              class="btn"
              v-if="state.enormousAmountPointsMode"
              @click="random10000Points()"
            >
              随机生成10000个点标注
            </button>
            <button class="btn" @click="clear()">清空画布</button>
          </div>
        </div>
      </div>
      <div ref="osdRef" class="osd"></div>
    </div>
    <div v-if="state.painter" class="debug">
      <div class="debug-item" title="鼠标在视口中的位置">
        鼠标坐标：（{{ state.painter.debug.mouseX }}，{{
          state.painter.debug.mouseY
        }}）
      </div>
      <div class="debug-item" title="鼠标在图像中的位置">
        图像坐标：（{{
          parseInt(state.painter.debug.dziCoordByMouse.value.x)
        }}，{{ parseInt(state.painter.debug.dziCoordByMouse.value.y) }}）
      </div>
      <div class="debug-item" title="鼠标是否在画布内">
        鼠标在画布内：{{
          state.painter.debug.isMouseOutside.value ? "否" : "是"
        }}
      </div>
      <div class="debug-item" title="鼠标是否在画布内按下左键">
        鼠标左键按下：{{
          state.painter.debug.isLeftMousePressed.value ? "是" : "否"
        }}
      </div>
      <div class="debug-item" title="悬浮图形的ID">
        悬浮图形ID：{{ state.painter.debug.hoverShape.value?.id ?? "-" }}
      </div>
      <div class="debug-item" title="悬浮编辑锚点的坐标">
        悬浮编辑锚点：{{
          state.painter.debug.hoverAnchor.value
            ? `（${parseInt(
                state.painter.debug.hoverAnchor.value.x
              )}，${parseInt(state.painter.debug.hoverAnchor.value.y)}）`
            : "-"
        }}
      </div>
      <div class="debug-item" title="图形数量">
        图形数量：{{ state.shapes.length }}
      </div>
      <div class="debug-item" title="是否开启巨量点标注模式">
        巨量点标注模式：{{ state.enormousAmountPointsMode ? "开启" : "关闭" }}
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  .header {
    height: 55px;
    border-bottom: 1px solid #e2e2e3;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 50px;
    font-weight: bold;
    font-size: 18px;
    color: #3c3c43;
    flex-shrink: 0;
    .left-title {
      display: flex;
      align-items: center;
      .logo {
        margin-right: 15px;
        user-select: none;
      }
    }
    .github {
      width: 22px;
      height: 22px;
      cursor: pointer;
    }
  }
  .main {
    flex-grow: 1;
    display: flex;
    .tools {
      width: 300px;
      flex-shrink: 0;
      padding: 20px;
      overflow: auto;
      border-right: 1px solid #e2e2e3;
      .mode-title {
        margin-bottom: 5px;
      }
      .tools-list {
        .item {
          display: block;
          cursor: pointer;
          border: 1px solid #e2e2e3;
          margin-bottom: 5px;
          padding: 5px;
          border-radius: 2px;
          transition: all ease 0.3s;
          &:hover {
            background-color: #e9e9e9;
          }
        }
      }
      .btns {
        margin-top: 20px;
        .btn {
          padding: 5px 0;
          display: block;
          width: 100%;
          margin-bottom: 10px;
          cursor: pointer;
        }
      }
    }
    .osd {
      flex-grow: 1;
    }
  }
  .debug {
    height: 30px;
    border-top: 1px solid #e2e2e3;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    font-size: 12px;
    overflow: hidden;
    -o-text-overflow: ellipsis;
    text-overflow: ellipsis;
    white-space: nowrap;
    .debug-item {
      height: 100%;
      padding: 0 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      transition: all ease 0.3s;
      &:hover {
        background-color: #e9e9e9;
      }
    }
  }
}
</style>

<style lang="scss">
html,
body {
  margin: 0;
  padding: 0;
}
#app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #fff;
  font-size: 14px;
}
</style>
