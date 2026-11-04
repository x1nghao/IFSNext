// 搜索/筛选/排序与名单分列：只影响本地展示，不触碰云端表格。
// 进入应用时总是回到「全部」——筛选状态不持久化（有意为之）。
import { ref, computed } from 'vue';
import type { Agent } from '@/types';
import {
  filterAgents,
  sortAgents,
  hasActiveFilters,
} from '@/utils/agents';
import type { StatusFilter, FactionFilter, AgentFilters } from '@/utils/agents';
import { useAgentData } from './useAgentData';

const { agents } = useAgentData();

const searchQuery = ref('');
const statusFilter = ref<StatusFilter>('all');
const factionFilter = ref<FactionFilter>('all');
// 面板默认收纳在三横线按钮后，筛选生效时按钮显示指示点
const showFilters = ref(false);

const activeFilters = computed<AgentFilters>(() => ({ status: statusFilter.value, faction: factionFilter.value }));
const filteredAgents = computed(() => filterAgents(agents.value, searchQuery.value, activeFilters.value));

const setStatusFilter = (v: string) => { statusFilter.value = v as StatusFilter; };
const setFactionFilter = (v: string) => { factionFilter.value = v as FactionFilter; };
const filtersActive = computed(() => hasActiveFilters(activeFilters.value));

const sortKey = ref('');
const sortOrder = ref('asc');

const setSort = (key: string) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

const sortedAgents = computed(() => sortAgents(filteredAgents.value, sortKey.value, sortOrder.value));

const clearSearch = () => {
  searchQuery.value = '';
};

// 一键复位两组筛选（计数芯片与三横线指示点随之消失）
const clearFilters = () => {
  statusFilter.value = 'all';
  factionFilter.value = 'all';
};

// ── 名单显式分列：CSS 断点决定列数（1/2/3），JS 把名单均分进列容器。
// 列内首行天然无分隔条，杜绝分栏续行把分隔条带到列顶的问题。──
const rosterColumnCount = ref(1);
let rosterMqlWide: MediaQueryList | null = null;
let rosterMqlMid: MediaQueryList | null = null;
const updateRosterColumnCount = () => {
  rosterColumnCount.value = rosterMqlWide?.matches ? 3 : rosterMqlMid?.matches ? 2 : 1;
};
const rosterColumns = computed<Agent[][]>(() => {
  const count = Math.max(1, rosterColumnCount.value);
  const cols: Agent[][] = Array.from({ length: count }, () => []);
  // 按列轮转填充：列高更均衡，搜索/筛选后的短名单也分布自然
  sortedAgents.value.forEach((agent, i) => {
    const col = cols[i % count];
    if (col) col.push(agent);
  });
  return cols;
});

// 断点监听由 App.vue 在 onMounted/onUnmounted 里启停（与 CSS 断点保持一致：≥1120px 三列，≥768px 两列）
const initRosterColumns = () => {
  rosterMqlWide = window.matchMedia('(min-width: 1120px)');
  rosterMqlMid = window.matchMedia('(min-width: 768px)');
  updateRosterColumnCount();
  rosterMqlWide.addEventListener('change', updateRosterColumnCount);
  rosterMqlMid.addEventListener('change', updateRosterColumnCount);
};

const disposeRosterColumns = () => {
  rosterMqlWide?.removeEventListener('change', updateRosterColumnCount);
  rosterMqlMid?.removeEventListener('change', updateRosterColumnCount);
  rosterMqlWide = null;
  rosterMqlMid = null;
};

export function useFilters() {
  return {
    searchQuery,
    statusFilter,
    factionFilter,
    showFilters,
    filtersActive,
    filteredAgents,
    rosterColumns,
    sortKey,
    sortOrder,
    setStatusFilter,
    setFactionFilter,
    setSort,
    clearSearch,
    clearFilters,
    initRosterColumns,
    disposeRosterColumns,
  };
}
