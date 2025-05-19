<template>
  <!-- sandbox="allow-scripts allow-same-origin allow-top-navigation allow-forms allow-popups allow-pointer-lock allow-popups-to-escape-sandbox" -->
  <div class="wayback__frame" v-if="url">
    <div class="wayback__title">
      <h2>
        <span class="wayback__title__text">{{ meta.ehs_title_short }}</span>
        <span class="wayback__title__domain"
          >&mdash; {{ meta.ehs_domain }}</span
        >
      </h2>

      <div class="wayback-engine-switch">
        <span>pywb</span
        ><Toggle
          v-model="engine"
          falseValue="pywb"
          trueValue="openwb"
          @change="onEngineSwitch"
        /><span>openwayback</span>
      </div>

      <button class="wayback__title__close" @click.prevent="$emit('close')">
        <IconClose /><span class="visually-hidden">Close</span>
      </button>
    </div>

    <nav class="wayback__snapshots">
      <ul class="snapshots__list">
        <li
          v-for="snapshot in orderedSnapshots"
          :key="snapshot.id"
          :class="{
            'snapshot-active': snapshot.ehs_wayback_date == currentWaybackDate,
          }"
        >
          <article
            class="snapshot-article"
            @click="
              selectSnapshot(
                snapshot.ehs_wayback_date,
                snapshot.ehs_start_url,
                snapshot.id,
              )
            "
          >
            <p class="snapshot-date">
              {{ formatWaybackDateFilter(snapshot.ehs_wayback_date) }}
            </p>
            <img
              :src="'/api/helpers/cover/' + encodeURIComponent(snapshot.id)"
              class="snapshot-image"
            />
          </article>
        </li>
      </ul>
    </nav>

    <!-- allow-top-navigation allow-top-navigation-by-user-activation -->
    <iframe
      id="wayback"
      :src="url"
      class="wayback__iframe"
      sandbox="allow-scripts allow-same-origin"
      v-if="isAuthenticated && !showPdf"
    >
    </iframe>
    <div class="wayback-pdf" v-else-if="isAuthenticated && showPdf">
      <PDFViewer v-if="url" :url="url" />
    </div>
    <div v-else class="wayback__not-authenticated">
      <p>
        <IconRestricted />
        <span>
          This website is protected by copyright and may only be consulted in
          the Swiss National Library reading rooms.
        </span>
        <span>
          Die Website ist urheberrechtlich geschützt und nur in den
          Publikumsräumen der Schweizerischen Nationalbibliothek einsehbar.
        </span>
        <span>
          Le site web est protégé par le droit d'auteur et ne peut être consulté
          que dans les salles publiques de la Bibliothèque nationale suisse.
        </span>
        <span>
          Il sito web è protetto dal diritto d'autore e può essere consultato
          unicamente nelle sale pubbliche della Biblioteca nazionale svizzera.
        </span>
      </p>
    </div>
  </div>
</template>

<script>
import { ToggleButton } from 'vue-js-toggle-button';
import '@vueform/toggle/themes/default.css';
import Toggle from '@vueform/toggle';
import { pad, getWaybackDate, formatWaybackDate } from '../lib/utils';
import IconClose from '../assets/icons/close.svg';
import IconRestricted from '../assets/icons/icon-restricted.svg';
import PDFViewer from './PDFViewer.vue';

export default {
  name: 'Wayback',
  components: {
    Toggle,
    IconClose,
    IconRestricted,
    PDFViewer,
  },
  props: {
    isAuthenticated: { type: Boolean, default: false },
    customUrl: { type: String, default: null },
    meta: {},
    snapshots: Array,
    config: {
      type: Object,
      default: {
        pywbBase: 'https://ehelvetica-dev-host.ch',
        openWbBase: 'https://openwb.ehelvetica-dev-host.ch',
      },
    },
  },
  computed: {
    orderedSnapshots: function () {
      const self = this;
      return this.snapshots.sort((a, b) => {
        const da = getWaybackDate(a.ehs_wayback_date);
        const db = getWaybackDate(b.ehs_wayback_date);
        return da - db;
      });
    },
  },

  data() {
    return {
      url: undefined,
      currentWaybackDate: '',
      engine: 'pywb',
      snapshotData: null,
      showPdf: false,
    };
  },

  methods: {
    onEngineSwitch(value) {
      if (value === true) {
        this.engine = 'openwb';
      } else if (value === false) {
        this.engine = 'pywb';
      }
      this.selectSnapshot(this.currentWaybackDate);
    },

    async selectSnapshot(waybackStr, customUrl, id) {
      this.showPdf = false;
      this.url = this.getWaybackUrl(
        waybackStr,
        customUrl ?? this.meta.ehs_start_url,
      );
      this.currentWaybackDate = waybackStr;
      console.log(
        `selectSnapshot ${this.url} ${this.currentWaybackDate} id=${id}`,
        customUrl,
        this.meta,
      );
      // fetch meta information on snapshot (such as document type)
      const result = await this.fetchId(id ?? this.meta.id);
      if (result?.ehs_content_type === 'application/pdf') {
        this.showPdf = true;
      }
    },

    onMessageReceived(e) {
      //console.log('onMessageReceived', e);
    },

    getWaybackUrl(timestamp, startUrl) {
      if (this.engine === 'pywb') {
        return `${
          this.config.pywbBase
        }/nb-webarchive/${timestamp}mp_/${encodeURIComponent(startUrl)}`;
      } else {
        return `${this.config.openWbBase}/wayback/${timestamp}/${startUrl}`;
      }
    },

    formatWaybackDateFilter(dt) {
      return formatWaybackDate(dt);
    },

    async fetchId(id) {
      let snapshotData = null;
      console.log({ fetchId: id, config: this.config });
      await fetch(
        `${this.config.apiBase}/search/id/${encodeURIComponent(id)}`,
        {
          credentials: 'include',
        },
      )
        .then((response) => {
          return response.json();
        })
        .then((data) => {
          snapshotData = data;
        })
        .finally(() => {
          // stop throbber
        });
      return snapshotData;
    },
  },

  created() {
    console.log('[Wayback] ', this.meta, this.config);
    this.selectSnapshot(this.meta.ehs_wayback_date, this.customUrl);
    //this.url = this.getWaybackUrl(this.meta.ehs_wayback_date, this.meta.ehs_start_url);
  },

  mounted() {
    window.addEventListener('message', this.onMessageReceived);
  },

  beforeDestroy() {
    window.removeEventListener('message', this.onMessageReceived);
  },
};
</script>

<style scoped lang="scss">
@import '../assets/css/variables';

.wayback__frame {
  height: 100%;
  display: grid;
  grid-template-rows: 4em auto 9em;
  grid-template-columns: 1fr;
}
.wayback__snapshots {
  width: 100%;
  height: 100%;
  position: relative;
  //flex-basis: 25em;

  grid-column: 1/3;
  grid-row: 3;
}
.wayback__title {
  grid-column: 1;
  grid-row: 1;
  grid-column-end: 3;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #eee;

  > h2 {
    font-size: 1em;
    margin: 0;
    padding: 0.25em 0 0 1em;
    flex: 1;
  }
}
.snapshots__list {
  border-top: 1px solid #eee;
  background-color: #eee;
  position: absolute;
  bottom: 0;
  right: 0;
  left: 0;
  overflow: auto;
  list-style: none;
  margin: 0;
  padding: 1em;
  max-height: 100%;
  -webkit-overflow-scrolling: touch;

  display: flex;
  width: 100%;
  height: 100%;
  user-select: none;
}
.snapshot-article {
  position: relative;
  border: 1px solid #eee;
  cursor: pointer;
  margin-right: 0.5em;
  transition: border-color 0.15s ease-in;
  min-width: 7em;
  min-height: 6em;
  user-select: none;

  &:hover,
  &:active {
    border-color: $color-black;
    transition: border-color 0.2s ease-out;
  }
}
.snapshot-image {
  width: 100%;
  max-width: 7em;
}
.snapshot-date {
  font-size: 0.8125em;
  text-align: center;
  margin: 0;
  font-weight: bold;
  color: #666;
  left: 50%;
  transform: translateX(-50%);
  position: absolute;
  display: inline-block;
  text-align: center;
  bottom: 1em;
  margin: 0;
  //background: $color-black;
  color: mix($color-white, $color-black, 50%);
  padding: 0.5em 1em;
  border-radius: 2em;
  bottom: -1.9em;
  // left: auto;
  // right: 0;
  // border-radius: 0;
  // transform: none;
  // padding: .375em .75em;
  // bottom: 0;
}
.snapshot-active {
  > article {
    border: 2px solid $color-red;
  }
}

.wayback__frame {
  > iframe {
    width: 100%;
    height: 100%;
    border: 0;
  }
}
.wayback-pdf {
  position: relative;
  height: 100%;
  overflow: hidden;
  overflow-y: auto;
}
.wayback-engine-switch {
  padding: 0.25em 0 0 1em;
  margin-right: 1em;

  > span {
    font-size: 0.875em;
    margin: 0 0.5em;
    color: mix($color-black, $color-white, 50%);
  }
}
.wayback__title__domain {
  color: mix($color-black, $color-white, 50%);
}
.wayback__title__close {
  appearance: none;
  border: 0;
  background: transparent;
  height: 100%;
  width: 4em;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:focus {
  }
  > svg {
    width: 1.25em;
    height: 1.25em;
  }
}
.wayback__not-authenticated {
  grid-row: 2;
  background: #f6f6f6;
  width: 100%;
  height: 100%;

  display: grid;
  justify-self: center;
  align-items: center;

  > p {
    margin: 0;
    text-align: center;

    > svg {
      height: 5em;
      margin-bottom: 1em;
    }
    > span {
      display: block;
      font-weight: bold;
      text-align: center;
      max-width: 80%;
      margin: 0 auto 0.5em auto;
    }
  }
}
</style>
<style lang="scss">
:root {
  --toggle-bg-on: rgb(130, 199, 235);
  --toggle-border-on: rgb(130, 199, 235);
}
</style>
