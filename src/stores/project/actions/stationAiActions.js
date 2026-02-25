import { retranslateStationEnglishNames } from '../../../lib/ai/stationEnTranslator'

export const stationAiActions = {
  async retranslateAllStationEnglishNamesWithAi() {
    if (!this.project) return { updatedCount: 0, total: 0, failedCount: 0 }
    if (this.isStationEnglishRetranslating) return { updatedCount: 0, total: 0, failedCount: 0 }

    const stations = (Array.isArray(this.project.stations)
      ? this.project.stations
      : [])
      .filter((station) => {
        // 跳过已固定英文名的站点
        return !station.nameEnFixed
      })
      .map((station) => ({
        stationId: station.id,
        nameZh: station.nameZh,
        nameEn: station.nameEn,
      }))
    const total = stations.length
    if (!total) return { updatedCount: 0, total: 0, failedCount: 0 }

    this.isStationEnglishRetranslating = true
    this.stationEnglishRetranslateProgress = {
      done: 0,
      total,
      percent: 0,
      message: '准备翻译任务...',
    }
    this.statusText = '全图英文重译已开始...'

    try {
      const result = await retranslateStationEnglishNames({
        stations,
        onProgress: ({ done, total: progressTotal, percent, message }) => {
          const safePercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
          this.stationEnglishRetranslateProgress = {
            done: Math.max(0, Math.floor(done || 0)),
            total: Math.max(0, Math.floor(progressTotal || total)),
            percent: safePercent,
            message: String(message || ''),
          }
          this.statusText = `全图英文重译中... ${Math.round(safePercent)}%`
        },
      })

      const stationById = new Map(this.project.stations.map((station) => [String(station.id), station]))
      let updatedCount = 0
      for (const update of result.updates || []) {
        const station = stationById.get(update.stationId)
        if (!station) continue
        const nextNameEn = String(update.nameEn || '').trim()
        if (!nextNameEn) continue
        if (station.nameEn === nextNameEn) continue
        station.nameEn = nextNameEn
        updatedCount += 1
      }

      if (updatedCount > 0) {
        this.touchProject(`全图英文重译完成: 更新 ${updatedCount}/${total} 站`)
      }
      const failedCount = Array.isArray(result.failed) ? result.failed.length : 0
      this.stationEnglishRetranslateProgress = {
        done: total,
        total,
        percent: 100,
        message: failedCount ? `完成（${failedCount} 站使用回退/失败）` : '完成',
      }
      this.statusText = failedCount
        ? `全图英文重译完成: 更新 ${updatedCount}/${total} 站，${failedCount} 站回退/失败`
        : `全图英文重译完成: 更新 ${updatedCount}/${total} 站`

      return { updatedCount, total, failedCount }
    } catch (error) {
      const message = String(error?.message || 'unknown error')
      this.stationEnglishRetranslateProgress = {
        done: this.stationEnglishRetranslateProgress?.done || 0,
        total,
        percent: this.stationEnglishRetranslateProgress?.percent || 0,
        message: `失败: ${message}`,
      }
      this.statusText = `全图英文重译失败: ${message}`
      throw error
    } finally {
      this.isStationEnglishRetranslating = false
    }
  },

  async retranslateStationEnglishNamesByIdsWithAi(stationIds = []) {
    if (!this.project) return { updatedCount: 0, total: 0, failedCount: 0 }
    if (this.isStationEnglishRetranslating) return { updatedCount: 0, total: 0, failedCount: 0 }

    const idSet = new Set((Array.isArray(stationIds) ? stationIds : []).map((id) => String(id || '').trim()).filter(Boolean))
    if (!idSet.size) return { updatedCount: 0, total: 0, failedCount: 0 }

    const stations = (Array.isArray(this.project.stations) ? this.project.stations : [])
      .filter((station) => {
        if (!idSet.has(station.id)) return false
        // 跳过已固定英文名的站点
        return !station.nameEnFixed
      })
      .map((station) => ({
        stationId: station.id,
        nameZh: station.nameZh,
        nameEn: station.nameEn,
      }))
    const total = stations.length
    if (!total) return { updatedCount: 0, total: 0, failedCount: 0 }

    this.isStationEnglishRetranslating = true
    this.stationEnglishRetranslateProgress = {
      done: 0,
      total,
      percent: 0,
      message: '准备翻译任务...',
    }
    this.statusText = `站点英文重译已开始（${total} 站）...`

    try {
      const result = await retranslateStationEnglishNames({
        stations,
        onProgress: ({ done, total: progressTotal, percent, message }) => {
          const safePercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
          this.stationEnglishRetranslateProgress = {
            done: Math.max(0, Math.floor(done || 0)),
            total: Math.max(0, Math.floor(progressTotal || total)),
            percent: safePercent,
            message: String(message || ''),
          }
          this.statusText = `站点英文重译中... ${Math.round(safePercent)}%`
        },
      })

      const stationById = new Map(this.project.stations.map((station) => [String(station.id), station]))
      let updatedCount = 0
      for (const update of result.updates || []) {
        const station = stationById.get(update.stationId)
        if (!station) continue
        const nextNameEn = String(update.nameEn || '').trim()
        if (!nextNameEn) continue
        if (station.nameEn === nextNameEn) continue
        station.nameEn = nextNameEn
        updatedCount += 1
      }

      if (updatedCount > 0) {
        this.touchProject(`站点英文重译完成: 更新 ${updatedCount}/${total} 站`)
      }
      const failedCount = Array.isArray(result.failed) ? result.failed.length : 0
      this.stationEnglishRetranslateProgress = {
        done: total,
        total,
        percent: 100,
        message: failedCount ? `完成（${failedCount} 站使用回退/失败）` : '完成',
      }
      this.statusText = failedCount
        ? `站点英文重译完成: 更新 ${updatedCount}/${total} 站，${failedCount} 站回退/失败`
        : `站点英文重译完成: 更新 ${updatedCount}/${total} 站`

      return { updatedCount, total, failedCount }
    } catch (error) {
      const message = String(error?.message || 'unknown error')
      this.stationEnglishRetranslateProgress = {
        done: this.stationEnglishRetranslateProgress?.done || 0,
        total,
        percent: this.stationEnglishRetranslateProgress?.percent || 0,
        message: `失败: ${message}`,
      }
      this.statusText = `站点英文重译失败: ${message}`
      throw error
    } finally {
      this.isStationEnglishRetranslating = false
    }
  },

  async retranslateSelectedStationEnglishNamesWithAi() {
    const ids = Array.isArray(this.selectedStationIds) ? this.selectedStationIds : []
    return this.retranslateStationEnglishNamesByIdsWithAi(ids)
  },
}
