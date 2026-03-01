# lib/ranking

全球轨道交通排行榜与工程里程排名计算。

## 文件说明

- **worldMetroRanking.js** — 从 Wikipedia `List of metro systems` 实时拉取全球地铁系统表格（MediaWiki Parse API），支持在多个 wikitable 中自动挑选可用表，并对常见表头变体（city/name/length）做兼容后输出按里程降序的排行榜。计算当前工程总里程与全球名次、前后相邻条目与里程差。
