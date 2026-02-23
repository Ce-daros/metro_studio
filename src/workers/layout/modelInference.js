/**
 * ONNX 模型推理模块 — 在 Web Worker 中加载并运行布局参数预测模型。
 * 输入: 20维图特征向量
 * 输出: 63维布局参数
 */
import * as ort from 'onnxruntime-web'

let session = null
let normData = null

/**
 * 加载 ONNX 模型和标准化参数。
 * @param {string} modelUrl - layout_params.onnx 的 URL
 * @param {string} normUrl - normalization.json 的 URL
 */
export async function loadModel(modelUrl, normUrl) {
  if (session) return
  const [modelBuf, normResp] = await Promise.all([
    fetch(modelUrl).then(r => r.arrayBuffer()),
    fetch(normUrl).then(r => r.json()),
  ])
  session = await ort.InferenceSession.create(modelBuf, {
    executionProviders: ['wasm'],
  })
  normData = normResp
}

export function isModelLoaded() {
  return session !== null && normData !== null
}

/**
 * 用模型预测布局参数。
 * @param {number[]} features - 20维图特征向量
 * @returns {object} 63个布局参数的 config 对象
 */
export async function predictParams(features) {
  if (!session || !normData) {
    throw new Error('模型未加载')
  }

  const { x_mean, x_std, y_mean, y_std, param_names } = normData

  // 标准化输入
  const normalized = new Float32Array(features.length)
  for (let i = 0; i < features.length; i++) {
    normalized[i] = (features[i] - x_mean[i]) / x_std[i]
  }

  const inputTensor = new ort.Tensor('float32', normalized, [1, features.length])
  const results = await session.run({ features: inputTensor })
  const paramsNorm = results.params_norm.data

  // 反标准化输出
  const config = {}
  for (let i = 0; i < param_names.length; i++) {
    config[param_names[i]] = paramsNorm[i] * y_std[i] + y_mean[i]
  }

  return config
}
