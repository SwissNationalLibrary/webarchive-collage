<template>
  <!--<div class="nav-wrapper"></div>-->
  <!--<div class="toc" v-if="outlineTree.value?.length > 0">-->
  <!-- <ChaptersList :items="outlineTree" @chapterClick="onChapterClick" />-->
  <!--</div>-->
  <div
    ref="parentRef"
    style="
      position: absolute;
      height: 100%;
      width: 100%;
      overflow-x: hidden;
      overflow-y: auto;
      background-color: #888;
      padding: 2em;
      contain: strict;
    "
  >
    <div
      :style="{
        height: `${totalSize}px`,
        width: '100%',
        margin: '0 auto',
        position: 'relative',
      }"
    >
      <div
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualRows[0]?.start ?? 0}px)`,
        }"
      >
        <div
          v-for="virtualRow in virtualRows"
          :key="virtualRow.key"
          :data-index="virtualRow.index"
          :ref="measureElement"
        >
          <VuePDF :pdf="pdf" :page="virtualRow.index + 1" fit-parent />
          <div style="margin-bottom: 1.5em"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { VuePDF, usePDF } from '@tato30/vue-pdf';
import { ref, watchEffect, triggerRef, computed, onMounted } from 'vue';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
import { useWindowVirtualizer, useVirtualizer } from '@tanstack/vue-virtual';

const props = defineProps({
  url: String,
});

const { pdf, pages, info, getPDFDestination } = usePDF({
  // DocumentInitParameters
  // see https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html
  url: props.url,
  withCredentials: true,
});
const outlineTree = ref([]);
// watchEffect(() => {
//   if (info.value.outline !== undefined && info.value.outline !== null) {
//     outlineTree.value = info.value.outline.map(function convert(node) {
//       return {
//         title: node.title,
//         destination: getPDFDestination(info.value.document, node.dest),
//         items: node.items.map((item) => {
//           return convert(item);
//         }),
//       };
//     });
//   }
// });

triggerRef(info);
function onChapterClick(value) {
  value.then((v) => {
    console.log(v);
  });
}

const parentRef = ref();
const parentOffsetRef = ref(0);

onMounted(() => {
  parentOffsetRef.value = parentRef.value?.offsetTop ?? 0;
});
const numPages = ref(pages);
const rowVirtualizerOptions = computed(() => {
  return {
    count: numPages.value,
    estimateSize: () => 22,
    getScrollElement: () => parentRef.value,
  };
});
const rowVirtualizer = useVirtualizer(rowVirtualizerOptions);
const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems());
const totalSize = computed(() => rowVirtualizer.value.getTotalSize());

const measureElement = (el) => {
  if (!el) {
    return;
  }
  rowVirtualizer.value.measureElement(el);
  return undefined;
};
</script>

<style scoped>
.scroller {
  height: 100%;
}
.nav-wrapper {
  position: sticky;
  top: 0;
  width: 100%;
  height: 100%;
  background-color: #888;
  z-index: 1;
}
.pdf-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: #888;
  display: block;
  justify-content: center;
}
</style>
