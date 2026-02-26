<script setup>
import { LINE_STYLE_OPTIONS } from '../../lib/lineStyles'
import { useProjectStore } from '../../stores/projectStore'
import { useToolbarStationOps } from '../../composables/useToolbarStationOps.js'
import { useToolbarEdgeOps } from '../../composables/useToolbarEdgeOps.js'
import { useToolbarLineOps } from '../../composables/useToolbarLineOps.js'

const store = useProjectStore()

const {
  stationForm,
  stationBatchForm,
  selectedStationCount,
  selectedStationsInOrder,
  selectedStation,
  stationEnglishRetranslateProgress,
  canEditSelectedManualTransfer,
  selectedManualTransferExists,
  applyStationRename,
  applyBatchStationRename,
  deleteSelectedStations,
  retranslateAllStationEnglishNames,
  addManualTransferForSelectedStations,
  removeManualTransferForSelectedStations,
} = useToolbarStationOps()

const {
  edgeBatchForm,
  selectedEdgeCount,
  selectedEdge,
  selectedEdgeStations,
  selectedEdgeLines,
  edgeReassignTargets,
  edgeSelectionCanApplyBatch,
  applySelectedEdgesBatch,
  resetEdgeBatchForm,
  deleteSelectedEdge,
} = useToolbarEdgeOps()

const {
  lineForm,
  activeLine,
  addLine,
  applyLineChanges,
  deleteActiveLine,
  displayLineName,
} = useToolbarLineOps()
</script>

<template>
  <!-- Station properties -->
  <section class="toolbar__section">
    <h3>站点属性</h3>
    <p class="toolbar__section-intro">编辑当前选中站点，或对多站点做批量操作。</p>
    <div class="toolbar__row">
      <button
        class="toolbar__btn"
        :disabled="!store.project?.stations?.length || store.isStationEnglishRetranslating"
        @click="retranslateAllStationEnglishNames"
      >
        {{ store.isStationEnglishRetranslating ? '全图英文重译中...' : 'AI 重新翻译所有英文站名' }}
      </button>
    </div>
    <div v-if="stationEnglishRetranslateProgress.total > 0" class="toolbar__progress">
      <div class="toolbar__progress-head">
        <span>{{ stationEnglishRetranslateProgress.message || '处理中...' }}</span>
        <strong>{{ Math.round(stationEnglishRetranslateProgress.percent || 0) }}%</strong>
      </div>
      <div class="toolbar__progress-track">
        <div
          class="toolbar__progress-fill"
          :style="{ width: `${Math.max(0, Math.min(100, stationEnglishRetranslateProgress.percent || 0))}%` }"
        ></div>
      </div>
      <p class="toolbar__hint">
        {{ stationEnglishRetranslateProgress.done || 0 }} / {{ stationEnglishRetranslateProgress.total || 0 }}
      </p>
    </div>
    <template v-if="selectedStation && selectedStationCount === 1">
      <input v-model="stationForm.nameZh" class="toolbar__input" placeholder="站点中文名" />
      <input v-model="stationForm.nameEn" class="toolbar__input" placeholder="Station English Name" />
      <div class="toolbar__row">
        <button class="toolbar__btn toolbar__btn--primary" @click="applyStationRename">保存站名</button>
        <button class="toolbar__btn toolbar__btn--danger" @click="deleteSelectedStations">删除选中站点</button>
      </div>
    </template>
    <template v-else-if="selectedStationCount > 1">
      <p class="toolbar__hint">已选 {{ selectedStationCount }} 个站点，可用模板批量重命名（`{n}` 为序号）。</p>
      <input v-model="stationBatchForm.zhTemplate" class="toolbar__input" placeholder="中文模板，例如：站点 {n}" />
      <input
        v-model="stationBatchForm.enTemplate"
        class="toolbar__input"
        placeholder="English template, e.g. Station {n}"
      />
      <label class="toolbar__label">起始序号</label>
      <input v-model.number="stationBatchForm.startIndex" type="number" min="1" class="toolbar__input" />
      <div class="toolbar__row">
        <button class="toolbar__btn toolbar__btn--primary" @click="applyBatchStationRename">批量重命名</button>
        <button class="toolbar__btn toolbar__btn--danger" @click="deleteSelectedStations">删除选中站点</button>
      </div>
      <div class="toolbar__divider"></div>
      <p class="toolbar__hint">
        手动换乘工具：请选择 2 个站点后，可将其视作换乘（不改原线路拓扑）。
      </p>
      <div class="toolbar__row">
        <button
          class="toolbar__btn"
          :disabled="!canEditSelectedManualTransfer || selectedManualTransferExists"
          @click="addManualTransferForSelectedStations"
        >
          设为换乘
        </button>
        <button
          class="toolbar__btn"
          :disabled="!canEditSelectedManualTransfer || !selectedManualTransferExists"
          @click="removeManualTransferForSelectedStations"
        >
          取消换乘
        </button>
      </div>
    </template>
    <p v-else class="toolbar__hint">请先在地图中选择站点</p>
  </section>

  <!-- Edge properties -->
  <section class="toolbar__section">
    <h3>线段属性</h3>
    <p class="toolbar__section-intro">支持多选线段批量改所属线、线型和曲线状态。</p>
    <template v-if="selectedEdgeCount > 0">
      <p class="toolbar__hint">已选线段: {{ selectedEdgeCount }} 条</p>
      <template v-if="selectedEdgeCount === 1 && selectedEdge">
        <p class="toolbar__hint">
          连接:
          {{ selectedEdgeStations.from?.nameZh || selectedEdge.fromStationId }}
          ↔
          {{ selectedEdgeStations.to?.nameZh || selectedEdge.toStationId }}
        </p>
        <p class="toolbar__hint">所属线路:</p>
        <ul class="toolbar__line-tags">
          <li v-for="line in selectedEdgeLines" :key="line.id" :title="line.nameZh">
            <span class="toolbar__line-swatch" :style="{ backgroundColor: line.color }"></span>
            <span>{{ displayLineName(line) }}</span>
          </li>
        </ul>
      </template>

      <label class="toolbar__label">所属线路（批量）</label>
      <select v-model="edgeBatchForm.targetLineId" class="toolbar__select" :disabled="!edgeReassignTargets.length">
        <option value="">保持不变</option>
        <option v-for="line in edgeReassignTargets" :key="`edge_batch_line_${line.id}`" :value="line.id">
          {{ displayLineName(line) }}
        </option>
      </select>

      <label class="toolbar__label">线型（批量）</label>
      <select v-model="edgeBatchForm.lineStyle" class="toolbar__select">
        <option value="">保持不变</option>
        <option v-for="style in LINE_STYLE_OPTIONS" :key="`edge_batch_style_${style.id}`" :value="style.id">
          {{ style.label }}
        </option>
      </select>

      <label class="toolbar__label">曲线状态（批量）</label>
      <select v-model="edgeBatchForm.curveMode" class="toolbar__select">
        <option value="keep">保持不变</option>
        <option value="curved">设为曲线</option>
        <option value="straight">设为直线（清控制点）</option>
      </select>

      <div class="toolbar__row">
        <button class="toolbar__btn toolbar__btn--primary" :disabled="!edgeSelectionCanApplyBatch" @click="applySelectedEdgesBatch">
          批量应用
        </button>
        <button class="toolbar__btn" @click="resetEdgeBatchForm">重置批量项</button>
        <button class="toolbar__btn toolbar__btn--danger" @click="deleteSelectedEdge">删除选中线段</button>
      </div>
    </template>
    <p v-else class="toolbar__hint">在地图中点击或框选线段后，可执行批量属性编辑。</p>
  </section>

  <!-- Line properties -->
  <section class="toolbar__section">
    <h3>线路属性</h3>
    <p class="toolbar__section-intro">一键新增线路（自动生成与现有线路差异更大的颜色），然后可在下方编辑详细属性。</p>
    <button class="toolbar__btn toolbar__btn--primary" @click="addLine">一键新增线路</button>
    <ul class="toolbar__line-list">
      <li v-for="line in store.project?.lines || []" :key="line.id">
        <button class="toolbar__line-item" :class="{ active: store.activeLineId === line.id }" @click="store.setActiveLine(line.id)">
          <span class="toolbar__line-swatch" :style="{ backgroundColor: line.color }"></span>
          <span>{{ displayLineName(line) }}</span>
        </button>
      </li>
    </ul>
    <template v-if="activeLine">
      <div class="toolbar__divider"></div>
      <p class="toolbar__hint">当前线路: {{ displayLineName(activeLine) }}</p>
      <input v-model="lineForm.nameZh" class="toolbar__input" placeholder="中文线路名" />
      <input v-model="lineForm.nameEn" class="toolbar__input" placeholder="English line name" />
      <input v-model="lineForm.color" type="color" class="toolbar__color" />
      <div class="toolbar__row">
        <select v-model="lineForm.status" class="toolbar__select">
          <option value="open">运营</option>
          <option value="construction">在建</option>
          <option value="proposed">规划</option>
        </select>
        <select v-model="lineForm.style" class="toolbar__select">
          <option v-for="style in LINE_STYLE_OPTIONS" :key="`edit_${style.id}`" :value="style.id">
            {{ style.label }}
          </option>
        </select>
      </div>
      <div class="toolbar__row">
        <button class="toolbar__btn toolbar__btn--primary" @click="applyLineChanges">保存线路</button>
        <button class="toolbar__btn toolbar__btn--danger" @click="deleteActiveLine">删除线路</button>
      </div>
    </template>
  </section>
</template>

<style src="./toolbar-shared.css"></style>
