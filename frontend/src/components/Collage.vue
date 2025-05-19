<template>
  <div class="collage__container">
    <div
      ref="osd"
      class="osd-container"
      :class="{ 'osd-container--wayback': isWaybackOpen }"
      :key="'rerender-' + JSON.stringify(isAuthenticated)"
    >
      <nav class="collage__navigation" v-if="!isDemo">
        <button id="collage-zoom-out">
          <IconZoomOut />
        </button>
        <button id="collage-zoom-in">
          <IconZoomIn />
        </button>
        <button
          id="collage-search"
          @click.prevent="isSearchOpen = !isSearchOpen"
        >
          <IconSearchHeader />
        </button>
        <button id="collage-screencast" @click="$emit('startChromecast')">
          <IconScreencast />
          <span v-if="castReceiverName">{{ castReceiverName }}</span>
        </button>
        <button
          id="collage-account"
          @click="!userData.email ? $emit('login') : logout()"
        >
          <IconAccount />
          <span v-if="userData.email">{{ userData.email }}</span>
        </button>
        <button id="collage-home" @click="onHomeButtonClick">
          <IconHome />
          <span>Start</span>
        </button>
      </nav>

      <transition name="slide-fade">
        <div class="wayback" v-if="isWaybackOpen">
          <Wayback
            :is-authenticated="isAuthenticated"
            :meta="currentItem"
            :config="config"
            :snapshots="currentSnapshots"
            :custom-url="waybackCustomUrl"
            @close="isWaybackOpen = false"
          />
        </div>
      </transition>

      <div class="collage__loading" v-if="!isDemo && isLoading">
        <p>Ladevorgang - Bitte warten...</p>
      </div>

      <div class="collage__meta" v-if="collageMeta">
        {{ collageDate }}
        ({{ collageMeta?.snapshotCount }} snapshots)
      </div>

      <transition name="slide-fade-up">
        <div class="collage__search" v-if="isSearchOpen">
          <form>
            <div class="collage__search__text">
              <input
                type="text"
                name="q"
                v-model="q"
                autocomplete="off"
                placeholder="Fulltext search"
                ref="searchQuery"
              />
              <div class="collage__search__info" v-if="searchActiveItem >= 0">
                <span>{{ searchActiveItem + 1 }}</span> of
                <span>{{ searchResults.numFound }}</span
                ><!-- ({{Number(searchResults.matches).toLocaleString()}} matches) -->
              </div>
              <button
                class="collage__search-submit"
                @click.prevent="submitSearchQuery"
              >
                <IconSearch />
              </button>
              <div v-if="isSearching" class="collage__search__spinner">
                <svg viewBox="0 0 100 100">
                  <circle
                    class="path"
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                  ></circle>
                </svg>
              </div>
            </div>

            <div class="collage__search__actions">
              <button
                class="collage__search-prev"
                @click.prevent="onSearchPrev"
                :disabled="
                  !(searchResults.numFound > 0 && searchActiveItem > 0)
                "
              >
                <IconPrev />
              </button>
              <button
                class="collage__search-next"
                @click.prevent="onSearchNext"
                :disabled="
                  !(
                    searchResults.numFound > 0 &&
                    searchActiveItem < searchResults.numFound
                  )
                "
              >
                <IconNext transform="rotate(180)" />
              </button>

              <button
                class="collage__search-close"
                @click.prevent="closeSearch"
              >
                <IconClose class="collage__search-close__icon" />
              </button>
            </div>
          </form>
        </div>
      </transition>
    </div>
  </div>
</template>

<script>
import OpenSeadragon from 'openseadragon';
import 'whatwg-fetch';
import RBush from 'rbush';
import Wayback from './Wayback.vue';
import { pad, getWaybackDate, formatWaybackDate } from '../lib/utils';
import IconZoomIn from '../assets/icons/zoom-in.svg';
import IconZoomOut from '../assets/icons/zoom-out.svg';
import IconHome from '../assets/icons/home.svg';
import IconClose from '../assets/icons/close.svg';
import IconSearch from '../assets/icons/search.svg';
import IconSearchHeader from '../assets/icons/search-lite.svg';
import IconAccount from '../assets/icons/user.svg';
import IconScreencast from '../assets/icons/screencast.svg';
import IconNext from '../assets/icons/arrow.svg';
import IconPrev from '../assets/icons/arrow.svg';
import qs from 'qs';
import anime from 'animejs';

const NS_SVG = 'http://www.w3.org/2000/svg';
const NS_XLINK = 'http://www.w3.org/1999/xlink';
const NS_XHTML = 'http://www.w3.org/1999/xhtml';
const MAX_OVERLAYS = 20;
const CANTALOUPE_META_IDENTIFIER_DELIMITER = ';';

// patch in svg overlays
window.OpenSeadragon = OpenSeadragon;
import '../lib/openseadragon-svg-overlays';

export default {
  name: 'Collage',
  components: {
    Wayback,
    IconZoomOut,
    IconZoomIn,
    IconHome,
    IconSearch,
    IconSearchHeader,
    IconClose,
    IconAccount,
    IconScreencast,
    IconNext,
    IconPrev,
  },

  props: {
    config: Object,
    collageMeta: Object,
    isRestricted: Boolean,
    collage: Object,
    dataBaseUrl: String,
    iiifBaseUrl: String,
    userData: Object,
    isAuthenticated: Boolean,
    isCastLoaded: Boolean,
    isCasting: Boolean,
    castType: String,
    castReceiverName: String,
    isDemo: Boolean,
  },

  watch: {
    isAuthenticated: function (newVal, prevVal) {
      this.destroyViewer();

      // wait for re-render of openseadragon container before re-initializing
      this.$nextTick(() => {
        this.initViewer();
      });
    },
  },

  data() {
    return {
      viewer: undefined,
      collageId: 'out2',
      cacheBuster: '',
      collageNumTiles: 6,
      dataWebarchives: {},
      snapshotsByUrnId: {},
      spatialIndex: {},
      itemsPerTileX: 2,
      itemsPerTileY: 2,
      numTilesX: 8,
      itemsPerRow: 0,
      subRows: 0,
      numRows: 0,
      snapshotCount: 0,
      iiifTileWidth: 1024,
      iiifTileHeight: 1024,
      // see cantaloupe config: max_pixels
      iiifMaxImagePixels: 400000000,
      itemWidth: 2724,
      itemHeight: 2048,
      selectionOverlays: [],
      isWaybackOpen: false,
      waybackCustomUrl: undefined,
      isLoading: true,
      currentItem: null,
      currentSnapshots: null,
      baseUrl: '',
      spatialByUrn: {},
      isSearching: false,
      isSearchOpen: false,
      q: '',
      searchActiveItem: -1,
      searchHighlights: [],
      searchResults: {
        numFound: 0,
        matches: 0,
        start: 0,
        rows: 0,
        docs: [],
        docsById: {},
      },
    };
  },

  computed: {
    collageDate() {
      let date;
      try {
        date = new Date(
          this.collageMeta?.cacheBuster?.substring(1, 5),
          +this.collageMeta?.cacheBuster?.substring(5, 7) - 1,
          this.collageMeta?.cacheBuster?.substring(7, 9),
        ).toLocaleDateString();
      } catch (e) {
        console.error(e);
      }
      return date;
    },
    apiBase() {
      return this.config.apiBase;
    },
  },

  methods: {
    logout() {
      if (!this.isRestricted) {
        this.$emit('logout');
      }
    },

    onHomeButtonClick() {
      this.closeSearch();
      this.q = '';

      this.isSearching = false;
      this.searchResults.numFound = 0;
      this.searchResults.matches = 0;
      this.searchResults.docs = [];
      this.searchResults.docsById = [];
      this.searchActiveItem = -1;
    },

    async fetchResults({
      q,
      start = 0,
      rows = 500,
      sort = 'score desc,ehs_urn_id asc',
    }) {
      const params = {
        q,
        f: {
          ehs_publication_type: ['webarchive'],
        },
        start,
        rows,
        sort,
      };

      this.isSearching = true;
      let results = null;
      await fetch(`${this.apiBase}/search?${qs.stringify(params)}`)
        .then((response) => {
          return response.json();
        })
        .then((data) => {
          const groups = data?.grouped?.ehs_group?.groups;
          if (this.isSearchOpen) {
            // might have been closed in the meantime
            this.searchResults.numFound = data?.grouped?.ehs_group?.ngroups;
            this.searchResults.start = start;
            this.searchResults.rows = groups.length;
            this.searchResults.matches = data?.grouped?.ehs_group?.matches ?? 0;

            results = groups?.map((group) => {
              const docs = group.doclist?.docs;
              return docs?.[0];
            });
          }
        })
        .finally(() => {
          // stop throbber
          this.isSearching = false;
        });

      return results;
    },

    async submitSearchQuery() {
      // https://ehelvetica-dev-host.ch/api/search/?q=web&v=webarchives&start=0&rows=100&sort=score%20desc%2C%20ehs_urn_id%20asc

      // clear current results
      this.searchResults.numFound = 0;
      this.searchResults.docs = [];
      this.searchResults.docsById = {};
      this.searchActiveItem = -1;

      let filteredQuery = this.q;
      if (filteredQuery?.trim()?.length > 0) {
        filteredQuery += ' AND ';
      }
      filteredQuery += ' NOT ehs_collection:wikipedia';
      this.searchResults.docs = await this.fetchResults({ q: filteredQuery });
      console.log('searchResults.docs=', this.searchResults);

      this.searchResults.docsById = this.searchResults.docs?.reduce(
        (agg, cur) => {
          agg[cur.ehs_urn_id] = cur;
          return agg;
        },
        {},
      );

      // map results
      this.createSearchOverlay();

      // focus first
      if (this.searchResults.numFound > 0) {
        const id = this.searchResults.docs[0]?.ehs_urn_id;
        if (id) {
          this.searchActiveItem = 0;
          this.onSearchResultFocus(id);
        }
      }
    },

    addTiles: function () {
      let numImagesAdded = 0;
      const viewportTileWidth = this.itemWidth * this.itemsPerRow,
        viewportTileHeight = this.itemHeight * this.subRows;

      console.log(
        `addTiles: vpTileWidth/height = ${viewportTileWidth} / ${viewportTileHeight}`,
      );
      let tx = 0,
        ty = 0;

      const tieredScale = this.isAuthenticated ? 1.0 : 1.0 / 6.81; // 27240px / 10 / 400px
      let sizes;
      let tieredScaleSuffix = '';
      if (tieredScale < 1.0) {
        //tieredScaleSuffix = `${CANTALOUPE_META_IDENTIFIER_DELIMITER}1125899906842624:7667378365598269`;
        tieredScaleSuffix = `${CANTALOUPE_META_IDENTIFIER_DELIMITER}100:681`;

        sizes = [
          { width: 125, height: 94 },
          { width: 250, height: 188 },
          { width: 500, height: 376 },
          { width: 1000, height: 752 },
          { width: 2000, height: 1504 },
          { width: 4000, height: 3007 },
        ];
      } else {
        sizes = [
          { width: 106, height: 80 },
          { width: 213, height: 160 },
          { width: 426, height: 320 },
          { width: 851, height: 640 },
          { width: 1703, height: 1280 },
          { width: 3405, height: 2560 },
          { width: 6810, height: 5120 },
          { width: 13620, height: 10240 },
        ];
      }

      // max allowed item size in pixels by legal definition
      const MAX_ALLOWED_ITEM_SIZE = 400;
      const tieredMaxWidth = MAX_ALLOWED_ITEM_SIZE * this.itemsPerRow;
      const tieredMaxHeight = MAX_ALLOWED_ITEM_SIZE * this.subRows;

      // example: a super row is 757272 x 36864 pixels and tile size (TIFF) is 1024x1024
      // with tile size (IIIF server) = 1024x1024: maximum scale-down is where "scale < min(w,h) / 1024"
      // should return the same values as
      // untiered: http://localhost:7981/iiif/2/collages!main-20220226!images!row-0.tif/info.json
      // tiered: http://localhost:7981/iiif/2/collages!main-20220226!images!row-0.tif;100:xxx/info.json

      // [
      //   { width: 1479, height: 72 },
      //   { width: 2958, height: 144 },
      //   { width: 5916, height: 288 },
      //   { width: 11832, height: 576 },
      //   { width: 23665, height: 1152 },
      //   { width: 47330, height: 2304 },
      // ],

      sizes = [2, 4, 8, 16, 32, 64, 128, 256, 512]
        .map((scale) => {
          const width = Math.round(viewportTileWidth / scale) * tieredScale;
          return {
            width,
            height: Math.round(
              (viewportTileHeight / viewportTileWidth) * width,
            ),
          };
        })
        .filter(({ width, height }) => width * height < this.iiifMaxImagePixels)
        .reverse();

      const tiles = [
        {
          scaleFactors: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
          width: this.iiifTileWidth,
          height: this.iiifTileHeight,
        },
      ];

      // number of images in each tile
      for (let i = 0; i < this.numRows; i++) {
        //(77129 - 15*18*278) / 278
        const rowHeight =
          i === this.numRows - 1
            ? this.itemHeight *
              Math.round(
                (this.snapshotCount - this.subRows * i * this.itemsPerRow) /
                  this.itemsPerRow,
              )
            : viewportTileHeight;
        console.log(`rowHeight for ${i} = ${rowHeight}`);
        const iiifSource = new OpenSeadragon.IIIFTileSource({
          '@id': `${this.iiifBaseUrl}/collages!${this.collageId}${this.cacheBuster}!row-${i}.tif${tieredScaleSuffix}`,
          '@context': 'http://iiif.io/api/image/2/context.json',
          profile: ['http://iiif.io/api/image/2/level2.json'],
          protocol: 'http://iiif.io/api/image',
          width: viewportTileWidth * tieredScale,
          height: rowHeight * tieredScale,
          sizes,
          tiles,
        });
        // console.log({
        //   '@id': `${this.iiifBaseUrl}/collages!${this.collageId}!images!row-${i}.tif${tieredScaleSuffix}`,
        //   '@context': 'http://iiif.io/api/image/2/context.json',
        //   profile: ['http://iiif.io/api/image/2/level2.json'],
        //   protocol: 'http://iiif.io/api/image',
        //   width: viewportTileWidth * tieredScale,
        //   height: viewportTileHeight * tieredScale,
        //   sizes,
        //   tiles,
        // });

        const bounds = new OpenSeadragon.Rect(
          0,
          i * viewportTileHeight,
          viewportTileWidth,
          rowHeight,
        );

        this.viewer.addTiledImage({
          tileSource: iiifSource,
          fitBounds: bounds,
          // x: tx * viewportTileWidth - (this.itemsPerTileX * viewportTileWidth) / 2,
          // y: ty * viewportTileHeight - (this.itemsPerTileX * viewportTileHeight) / 2,
          // width: viewportTileWidth,
          // placeholderFillStyle: (item, ctx) => {},
          placeholderFillStyle: 'gray',

          success: (event) => {
            numImagesAdded++;

            this.viewer.viewport.fitBoundsWithConstraints(
              new OpenSeadragon.Rect(
                0,
                0,
                viewportTileWidth,
                i * viewportTileHeight,
              ),
            );

            // this.viewer.viewport.fitBounds(
            //   new OpenSeadragon.Rect(
            //     (-this.itemsPerTileX * viewportTileWidth) / 2,
            //     (-this.itemsPerTileY * viewportTileHeight) / 2 + 50 * this.itemsPerTileY,
            //     this.itemsPerTileX * viewportTileWidth,
            //     this.itemsPerTileY * viewportTileHeight
            //   )
            // );
          },

          error: (event) => {
            numImagesAdded++;
          },
        });

        ty++;
        tx = 0;
      }
    },

    onSearchResultFocus(id) {
      const pos = this.spatialByUrn[id];
      if (!pos) return;
      const bounds = new OpenSeadragon.Rect(
        pos.minX,
        pos.minY,
        pos.maxX - pos.minX,
        pos.maxY - pos.minY,
      );
      this.viewer.viewport.fitBounds(bounds);
    },

    onSearchNext() {
      this.searchActiveItem++;
      const item = this.searchResults.docs[this.searchActiveItem];
      this.onSearchResultFocus(item.ehs_urn_id);
    },

    onSearchPrev() {
      if (this.searchActiveItem > 0) {
        this.searchActiveItem--;
      }
      const item = this.searchResults.docs[this.searchActiveItem];
      this.onSearchResultFocus(item.ehs_urn_id);
    },

    createSearchOverlay(id = 'search-overlay') {
      const overlay = this.viewer.svgOverlay();
      const svg = overlay.node();

      const totalWidth = this.itemWidth * this.itemsPerRow;
      // const totalHeight =
      //   this.itemHeight *
      //   Math.round(this.collageNumTiles / this.numTilesX) *
      //   this.itemsPerTileY;
      const totalHeight = this.itemHeight * this.subRows * this.numRows;
      let d = `M0,0H${totalWidth}V${totalHeight}H0`;

      //const resultIds = ['bel-159297', 'bel-151073'];
      const resultIds = this.searchResults.docs.map((r) => r.ehs_urn_id);
      this.searchHighlights = [];
      for (let i = 0; i < resultIds.length; i++) {
        console.log(resultIds[i], this.spatialByUrn[resultIds[i]]);

        if (this.spatialByUrn[resultIds[i]]) {
          const pos = this.spatialByUrn[resultIds[i]];
          d += ` M${pos.minX},${pos.minY} v${pos.maxY - pos.minY} h${
            pos.maxX - pos.minX
          } v-${pos.maxY - pos.minY} h-${pos.maxX - pos.minX}`;
          this.searchHighlights.push(resultIds[i]);
        }
      }

      if (this.searchHighlights.length > 0) {
        // path length is summed-up circumference for each item
        const totalPathLen =
          this.searchHighlights.length * (this.itemWidth + this.itemHeight) * 2;

        if (!document.getElementById(id)) {
          const path = document.createElementNS(NS_SVG, 'path');
          path.setAttribute('d', d);
          path.setAttribute('pointer-events', 'none');
          path.setAttribute('id', id);
          path.setAttribute('class', 'search-results-mask');
          path.setAttribute('stroke-dasharray', '' + totalPathLen);
          svg.appendChild(path);
        } else {
          const el = document.getElementById(id);
          el.setAttribute('d', d);
        }

        anime({
          targets: document.getElementById(id),
          strokeDashoffset: [
            totalPathLen,
            totalPathLen - 2 * (this.itemWidth + this.itemHeight),
          ], //[anime.setDashoffset, 0],
          easing: 'easeInOutSine',
          duration: 2500,
          loop: false,
        });
      } else {
        const el = document.getElementById(id);
        el.parentNode.removeChild(el);
      }
    },

    createInfoOverlay(id = 'select-overlays', num = 0) {
      const overlay = this.viewer.svgOverlay();

      const svg = overlay.node();
      svg.setAttribute('id', 'select-overlays');
      svg.setAttribute('class', `select-overlays`);

      // clipping
      // const defs = document.createElementNS(nsSVG, 'defs');
      // const clip = document.createElementNS(nsSVG, 'clipPath');
      // defs.appendChild(clip);

      // let clipId = Math.round(Math.random() * 100000);
      // clip.setAttribute('id', 'caption-clip-' + clipId);
      // let rect = document.createElementNS(nsSVG, 'rect');
      // rect.setAttribute('x', textRect.x);
      // rect.setAttribute('y', textRect.y);
      // rect.setAttribute('width', textRect.width);
      // rect.setAttribute('height', 1.2 * textRect.height);a
      // clip.appendChild(rect);

      let w = this.itemWidth / 2;
      let h = this.itemHeight / 10;
      const x = this.itemWidth / 2 - w / 2;
      const y = this.itemHeight / 2 - h / 2;

      const group = document.createElementNS(NS_SVG, 'g');
      group.setAttribute('class', `viewer-select ${id} viewer-select--hidden`);
      group.setAttribute('data-num', num);

      const rect = document.createElementNS(NS_SVG, 'rect');
      rect.setAttribute('x', 0);
      rect.setAttribute('y', 0);
      rect.setAttribute('width', this.itemWidth);
      rect.setAttribute('height', this.itemHeight);
      rect.setAttribute('fill', 'black');
      rect.setAttribute('class', 'overlay-bg');
      group.appendChild(rect);

      const buttonGroup = document.createElementNS(NS_SVG, 'g');
      buttonGroup.setAttribute('class', 'button-group');

      const button = document.createElementNS(NS_SVG, 'rect');
      button.setAttribute('class', 'button');
      // button.setAttribute('x', x);
      // button.setAttribute('y', y);
      // button.setAttribute('rx', h/2);
      // button.setAttribute('width', w);
      // button.setAttribute('height', h);
      // button.setAttribute('fill', 'white');
      w = this.itemWidth / 8;
      button.setAttribute('x', 0.5 * (this.itemWidth - w));
      button.setAttribute('y', 0.5 * (this.itemHeight - w));
      buttonGroup.setAttribute(
        'transform-origin',
        `${0.5 * this.itemWidth} ${0.5 * this.itemHeight}`,
      );
      button.setAttribute('rx', w / 2);
      button.setAttribute('width', w);
      button.setAttribute('height', w);
      button.setAttribute('fill', 'white');

      const circle = document.createElementNS(NS_SVG, 'circle');
      const r = 0.5 * w;
      circle.setAttribute('class', 'button-circle');
      circle.setAttribute('cx', 0.5 * this.itemWidth);
      circle.setAttribute('cy', 0.5 * this.itemHeight);
      circle.setAttribute('r', r * 1.25);
      buttonGroup.appendChild(circle);

      // const text = document.createElementNS(NS_SVG, 'text');
      // text.setAttribute('x', x + w / 2);
      // text.setAttribute('y', y + h / 2);
      // text.setAttribute('text-anchor', 'middle');
      // text.setAttribute('font-size', h / 2.5);
      // text.setAttribute('class', 'viewer-button-open__text');
      // text.setAttribute('dy', '.375em');
      // text.innerHTML = 'Play';

      const play = document.createElementNS(NS_SVG, 'g');
      play.setAttribute('x', this.itemWidth / 2);
      play.setAttribute('y', this.itemWidth / 2);
      play.setAttribute(
        'transform',
        `translate(${0.5 * this.itemWidth - 86},${
          0.5 * this.itemHeight - 86
        }) scale(2)`,
      );

      // Play button
      // let p = document.createElementNS(NS_SVG, "polygon");
      // p.setAttribute("points", "0,0 32.7,18.6 65.2,37.5 32.7,56.2 0,75.1");
      // p.setAttribute("fill", "white");

      // Replay button
      let p = document.createElementNS(NS_SVG, 'path');
      p.setAttribute(
        'd',
        'M58.667993,42 C58.671906,42.73047 58.293,43.4102 57.667993,43.793 L36.836,56.293 L36.832093,56.293 C36.507873,56.49222 36.132873,56.58988 35.750093,56.58206 C35.386813,56.58206 35.031343,56.496123 34.707093,56.33206 C34.066473,55.94534 33.671893,55.25006 33.667993,54.50006 L33.667993,29.50006 C33.671899,28.75006 34.066433,28.05476 34.707093,27.66806 C35.371153,27.31259 36.167993,27.31259 36.832093,27.66806 L57.664093,40.16806 L57.667993,40.16806 C58.30472,40.55478 58.6875,41.25396 58.667993,42.00006 L58.667993,42 Z',
      );
      p.setAttribute('fill', '#fff');
      play.appendChild(p);
      p = document.createElementNS(NS_SVG, 'path');
      p.setAttribute(
        'd',
        'M84.543,12.832 C83.78519,12.49997 82.9024,12.64841 82.293,13.207 L76.25,18.75 C68.6445,7.254 55.781,0.34 42,0.332 C30.949,0.332 20.352,4.7226 12.539,12.539 C4.7226,20.3515 0.332,30.949 0.332,42 C0.332,53.051 4.7226,63.648 12.539,71.461 C20.3515,79.2774 30.949,83.668 42,83.668 C53.051,83.668 63.648,79.2774 71.461,71.461 C79.2774,63.6485 83.668,53.051 83.668,42 L75.3321,42 C75.3321,50.8398 71.8204,59.32 65.5704,65.57 C59.3204,71.82 50.8404,75.3317 42.0004,75.3317 C33.1604,75.3317 24.6804,71.82 18.4304,65.57 C12.1804,59.32 8.6687,50.84 8.6687,42 C8.6687,33.16 12.1804,24.68 18.4304,18.43 C24.6804,12.18 33.1604,8.6683 42.0004,8.6683 C53.4184,8.687831 64.0044,14.6331 69.9574,24.3753 L63.5433,30.0433 C62.87924,30.6058 62.64486,31.5238 62.95736,32.3324 C63.28158,33.13318 64.05506,33.6605 64.91826,33.6683 L83.66826,33.6683 C84.21904,33.6683 84.75026,33.44564 85.14096,33.05502 C85.53158,32.66439 85.75034,32.13705 85.75034,31.58232 L85.75034,14.91432 L85.75034,14.918227 C85.816746,14.039317 85.33628,13.211227 84.54334,12.832327 L84.543,12.832 Z',
      );
      p.setAttribute('fill', '#fff');
      play.appendChild(p);

      // open search hit button
      /*
      const replayHitObject = document.createElementNS(NS_SVG, "foreignObject");
      replayHitObject.setAttribute('class','viewer-webarchive__result-actions');
      replayHitObject.setAttribute("x", 0);
      replayHitObject.setAttribute("y", this.itemHeight - (3 * .75*h) / 2.5 - .125 * this.itemHeight);
      replayHitObject.setAttribute("width", this.itemWidth);
      replayHitObject.setAttribute("height", (3 * .75*h) / 2.5);

      let replayHitButton = document.createElement("button");
      replayHitButton.setAttribute("class", "viewer-webarchive__result__button");
      replayHitButton.innerHTML = 'Suchtreffer öffnen';
      replayHitObject.appendChild(replayHitButton);

      group.appendChild(replayHitObject);
      */

      // const snapshotDate = document.createElementNS(NS_SVG, 'text');
      // text.setAttribute('x', x + w / 2);
      // text.setAttribute('y', y + h / 2);
      // text.setAttribute('text-anchor', 'middle');
      // text.setAttribute('font-size', h / 2.5);
      // text.setAttribute('class', 'viewer-select__title');
      // text.setAttribute('dy', '.375em');

      buttonGroup.appendChild(button);
      buttonGroup.appendChild(play);

      group.appendChild(buttonGroup);
      //group.appendChild(text);

      // website title
      // const title = document.createElementNS(NS_SVG, 'text');
      // title.setAttribute('x', x + w / 2);
      // title.setAttribute('y', this.itemHeight - 2 * h / 2.5);
      // title.setAttribute('text-anchor', 'middle');
      // title.setAttribute('font-size', h / 2.5);
      // title.setAttribute('class', 'viewer-webarchive__title__text');
      // title.setAttribute('dy', '.375em');
      // title.innerHTML = 'title placeholder';
      // group.appendChild(title);

      // test
      const meta = document.createElementNS(NS_SVG, 'foreignObject');
      meta.setAttribute('x', 0);
      meta.setAttribute('y', this.itemHeight - (3 * h) / 2.5);
      meta.setAttribute('width', this.itemWidth);
      meta.setAttribute('height', (3 * h) / 2.5);
      let wrapper = document.createElement('div');
      wrapper.setAttribute('class', 'viewer-webarchive__title__wrapper');

      let div = document.createElement('div');
      div.setAttribute('class', 'viewer-webarchive__title__meta');
      div.innerHTML = '';
      wrapper.appendChild(div);
      div = document.createElement('div');
      div.setAttribute('class', 'viewer-webarchive__title__date');
      div.innerHTML = '';
      wrapper.appendChild(div);
      meta.appendChild(wrapper);
      group.appendChild(meta);

      //group.setAttribute('transform', `translate(-${w/2},-${h/2})`);
      svg.appendChild(group);

      // TODO: rewrite - see solution at: https://codepen.io/iangilman/pen/byoqXE
      // and discussion at: https://github.com/openseadragon/openseadragon/issues/1652
      overlay.onClick(group, (e) => {
        if (!e.quick) return;
        const el = e.eventSource.element;
        const urnId = el.getAttribute('data-urnid');
        console.log(
          'click overlay',
          e,
          el,
          this.snapshotsByUrnId[urnId],
          this.snapshotsByUrnId[urnId].ehs_start_url,
        );

        if (e.originalEvent?.target?.tagName === 'BUTTON') {
          const hit = this.searchResults.docsById[urnId];
          console.log('display hit', hit);

          this.openWebarchive(this.snapshotsByUrnId[urnId], hit?.url);
        } else {
          this.openWebarchive(this.snapshotsByUrnId[urnId]);
        }
      });

      return overlay;
    },

    openWebarchive(webarchive, customUrl) {
      this.isWaybackOpen = true;
      this.currentItem = webarchive;
      this.waybackCustomUrl = customUrl;
      // // !!! remove after testing #257
      // this.waybackCustomUrl =
      //   'https://schw-stv.ch/wp-content/uploads/2023/03/C-22-23-02.pdf';
      // this.currentItem.id =
      //   'bel-2031783!20230816134153/RN3Q82azgeKpobxYj6Cziw==';
      this.currentSnapshots =
        this.dataWebarchives[webarchive.ehs_group].snapshots;
    },

    updateOverlays() {
      const viewportBounds = this.viewer.viewport.getBounds();
      if (this.itemHeight >= viewportBounds.height * 0.6) {
        const searchBox = {
          minX: viewportBounds.x,
          minY: viewportBounds.y,
          maxX: viewportBounds.x + viewportBounds.width,
          maxY: viewportBounds.y + viewportBounds.height,
        };
        const results = this.spatialIndex?.search?.(searchBox) ?? [];
        // console.log('bounds', viewportBounds, searchBox);
        // console.log(results);

        for (let i = 0; i < MAX_OVERLAYS; i++) {
          // align overlays to items
          const node = document.querySelector('.viewer-selection--' + i);
          const resultActions = node.querySelector(
            '.viewer-webarchive__result-actions',
          );

          if (i < results.length) {
            node.setAttribute(
              'transform',
              `translate(${results[i].minX},${results[i].minY})`,
            );
            node.setAttribute('data-urnid', results[i].urnId);
            node.classList.remove('viewer-select--hidden');

            const meta = this.snapshotsByUrnId[results[i].urnId];
            if (!meta) continue;
            // const el = node.querySelector('.viewer-webarchive__title__text');

            // el.innerHTML = `${meta.ehs_title_short}<tspan> &mdash; ${meta.ehs_domain}</tspan>`;

            let el = node.querySelector('.viewer-webarchive__title__meta');
            el.innerHTML = `${meta.ehs_title_short}<span> &mdash; ${meta.ehs_domain}</span>`;

            // el = node.querySelector('.viewer-webarchive__title__date');
            // el.innerHTML = `<span>${formatWaybackDate(meta.ehs_wayback_date)}</span>`;

            // if (this.searchResults?.docsById[results[i].urnId]) {
            //   //resultActions.classList.remove('viewer-webarchive__result-actions--hidden');
            // } else {
            //   resultActions.classList.add('viewer-webarchive__result-actions--hidden');
            // }
          } else {
            node.classList.add('viewer-select--hidden');
          }
        }
      } else {
        const nodes = document.querySelectorAll('.viewer-select');
        nodes.forEach((n) => n.classList.add('viewer-select--hidden'));

        // reset iframe
        this.isWaybackOpen = false;
        this.currentItem = null;
      }
    },

    closeSearch: function () {
      this.isSearchOpen = false;

      const elOverlay = document.getElementById('search-overlay');
      if (elOverlay) {
        elOverlay.parentNode.removeChild(elOverlay);
      }
    },

    onViewerAnimation: function (e) {
      this.updateOverlays();
    },

    onViewerAnimationFinished: function (e) {
      this.updateOverlays();
      // this.preventCanvasClick = false;
    },

    onViewerPan: function (e) {
      // this.preventCanvasClick = true;
    },

    onViewerZoom: function (e) {
      // this.preventCanvasClick = true;
    },

    handleKeydown(e) {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
        return this.$emit('logout');
      }

      if (!this.isSearchOpen) {
        this.isSearchOpen = true;
        this.$nextTick(() => {
          this.$refs.searchQuery.focus();
        });
      }
    },

    handleCanvasPress() {
      //this.preventCanvasClick = true;
    },

    handleCanvasRelease() {
      //this.preventCanvasClick = false;
    },

    handleCanvasClick(event) {
      console.log(event);
      if (!event.quick) return;

      const viewportCoords = this.viewer.viewport.windowToViewportCoordinates(
        event.position,
      );
      console.log(viewportCoords);

      const searchBox = {
        minX: viewportCoords.x,
        minY: viewportCoords.y,
        maxX: viewportCoords.x,
        maxY: viewportCoords.y,
      };
      if (!this.spatialIndex) return;

      const results = this.spatialIndex?.search?.(searchBox) ?? [];
      console.log(results);

      // zoom to result
      if (results.length > 0) {
        const item = results[0];
        const bounds = new OpenSeadragon.Rect(
          item.minX,
          item.minY,
          item.maxX - item.minX,
          item.maxY - item.minY,
        );
        // bounds.x = bounds.x - bounds.width;
        // bounds.y = bounds.y - bounds.height;
        // bounds.width *= 2;
        // bounds.height *= 2;
        bounds.y -= bounds.height / 4;
        bounds.height += bounds.height / 2;
        console.log(bounds);
        this.viewer.viewport.fitBounds(bounds);
      }
    },

    onMessageReceived(e) {
      if (e.data == 'e-view__cmd__close') {
        this.isWaybackOpen = false;
      }
    },

    adjustZoomLevels(newSize) {
      if (!this.viewer) {
        return;
      }

      // real size (px)
      const viewportTileWidth = this.itemWidth * this.itemsPerRow;
      const viewportTileHeight = this.itemHeight * this.subRows * this.numRows;
      const tieredScale = this.isAuthenticated ? 1.0 : 1.0 / 6.81;

      // console.log(
      //   'adjustZoomLevels, newSize',
      //   newSize,
      //   viewportTileWidth,
      //   viewportTileHeight,
      //   this.viewer.viewport.getContainerSize()
      // );
      this.viewer.viewport.minZoomLevel = Math.max(
        (1.05 * newSize.x) / newSize.y / viewportTileWidth,
        (1.05 * newSize.y) / newSize.x / viewportTileHeight,
      );
      console.log('set minzoom', this.viewer.viewport.minZoomLevel);
      this.viewer?.viewport?.applyConstraints(false);
    },

    onViewerResize(e) {
      const { eventSource, newContainerSize, maintain } = e;
      if (this.isDemo) {
        this.adjustZoomLevels(newContainerSize);
      }
    },

    initViewer() {
      const viewportTileWidth = this.itemWidth * this.itemsPerRow;
      const viewportTileHeight = this.itemHeight * this.subRows * this.numRows;

      this.viewer = OpenSeadragon({
        element: this.$refs.osd,
        prefixUrl: 'images/',
        maxZoomPixelRatio: this.isAuthenticated ? 3.0 : 3.0,
        constrainDuringPan: true,
        constrainDuringZoom: this.isDemo,
        showNavigator: !this.isDemo,
        debugMode: false,
        debugGridColor: 'red',
        navigatorAutoFade: true,
        navigatorPosition: 'BOTTOM_LEFT',
        //imageLoaderLimit: 128,
        zoomInButton: 'collage-zoom-in',
        zoomOutButton: 'collage-zoom-out',
        homeButton: 'collage-home',
        fullPageButton: 'osd-fullpage',
        ...(this.isDemo && {
          visibilityRatio: 1,
          //minZoomImageRatio: 1,
          //minZoomLevel: 1 / viewportTileWidth,
        }),
      });
      //this.viewer.zoomPerClick = 1;
      this.viewer.gestureSettingsMouse.clickToZoom = false;
      this.viewer.viewport.setMargins({
        left: 0,
        right: 0,
        top: !this.isDemo ? 84 : 0,
        bottom: !this.isDemo ? 84 : 0,
      });

      // this.viewer.addHandler('pan', this.handlePan.bind(this));
      // this.viewer.addHandler('zoom', this.handleZoom.bind(this));
      this.viewer.addHandler(
        'animation-finish',
        this.onViewerAnimationFinished,
      );
      this.viewer.addHandler('animation', this.onViewerAnimation);
      this.viewer.addHandler('pan', this.onViewerPan);
      this.viewer.addHandler('zoom', this.onViewerZoom);
      this.viewer.addHandler('resize', this.onViewerResize);
      this.viewer.addHandler('canvas-click', this.handleCanvasClick);
      this.viewer.addHandler('canvas-press', this.handleCanvasPress);
      this.viewer.addHandler('canvas-release', this.handleCanvasRelease);

      for (let i = 0; i < MAX_OVERLAYS; i++) {
        const overlay = this.createInfoOverlay(`viewer-selection--${i}`);
        this.selectionOverlays.push(overlay);
      }

      this.addTiles();
    },

    destroyViewer() {
      this.viewer.removeHandler(
        'animation-finish',
        this.onViewerAnimationFinished,
      );
      this.viewer.removeHandler('animation', this.onViewerAnimation);
      this.viewer.removeHandler('resize', this.onViewerResize);
      this.viewer.removeHandler('pan', this.onViewerPan);
      this.viewer.removeHandler('zoom', this.onViewerZoom);
      this.viewer.removeHandler('canvas-click', this.handleCanvasClick);
      this.viewer.removeHandler('canvas-press', this.handleCanvasPress);
      this.viewer.removeHandler('canvas-release', this.handleCanvasRelease);
      this.viewer.destroy();
      this.viewer = null;
    },
  },

  async created() {
    console.log(
      '[Collage] using config ',
      this.config,
      'collage',
      this.collage,
    );

    // prod config
    this.collageNumTiles = this.collage.collageNumTiles;
    this.collageId = this.collage.id;
    this.cacheBuster = this.collage.cacheBuster;
    this.itemsPerRow = this.collage.itemsPerRow;
    this.subRows = this.collage.subRows;
    this.numRows = this.collage.numRows;
    this.snapshotCount = this.collage.snapshotCount;

    if (this.isDemo) {
      return;
    }

    // fetch index data
    this.isLoading = true;
    this.loadingText = 'Loading webarchives index';
    console.log(
      'load spatial index from ',
      `${this.dataBaseUrl}/${this.collage.spatialIndexUri}`,
    );

    fetch(`${this.dataBaseUrl}/${this.collage.spatialIndexUri}`)
      .then((response) => {
        return response.json();
      })
      .then((data) => {
        //this.dataIndex = data;
        this.spatialIndex = new RBush();
        this.spatialIndex.load(data);

        // reverse lookup table
        for (let i = 0; i < data.length; i++) {
          this.spatialByUrn[data[i].urnId] = data[i];
        }
      });

    // fetch webarchives data
    this.loadingText = 'Loading webarchives metadata';
    console.log(
      'load metadata from ',
      `${this.dataBaseUrl}/${this.collage.metadataUri}`,
    );
    fetch(`${this.dataBaseUrl}/${this.collage.metadataUri}`)
      .then((response) => {
        return response.json();
      })
      .then((data) => {
        this.dataWebarchives = data;

        // restructure on load
        const keys = Object.keys(this.dataWebarchives);
        for (let i = 0; i < keys.length; i++) {
          const group = this.dataWebarchives[keys[i]];
          for (let j = 0; j < group.snapshots.length; j++) {
            this.snapshotsByUrnId[group.snapshots[j].ehs_urn_id] =
              group.snapshots[j];
          }
        }
      });
  },

  mounted() {
    this.initViewer();
    window.addEventListener('message', this.onMessageReceived);
    //window.focus(this.$refs.osd);
    window.addEventListener('keydown', this.handleKeydown);
    if (this.isDemo) {
      document.body.style.background = '#fff';
      this.adjustZoomLevels(this.viewer.viewport.getContainerSize());
    }
  },

  beforeDestroy() {
    this.destroyViewer();
    window.removeEventListener('keydown', this.handleKeydown);
    window.removeEventListener('message', this.onMessageReceived);
  },
};
</script>

<style scoped lang="scss">
@import '../assets/css/variables';
@import '../assets/css/openseadragon';

.osd-container {
  width: 100%;
  height: 100%;
}

.collage__loading {
  position: absolute;
}

.collage__navigation {
  position: absolute;
  width: auto;
  right: 0;
  z-index: 2;
  display: flex;
  height: 2.625em;
  border: 0;
  align-items: center;
  justify-content: center;

  > button {
    height: 100%;
    appearance: none;
    flex: 1;
    border: 0;
    background: rgba($color-black, 0.5);
    background: rgba($color-white, 1);
    cursor: pointer;
    white-space: nowrap;
    display: flex !important;
    align-items: center;

    > span {
      color: mix($color-white, $color-black, 80%);
      color: mix($color-white, $color-black, 20%);
      margin-left: 0.5em;
    }

    &:focus,
    &:active,
    &:hover {
      color: $color-white;
      color: $color-black;
      outline: none;

      > svg {
        fill: $color-white;
        fill: $color-black;
      }
      > span {
        color: $color-white;
        color: $color-black;
      }
    }

    > svg {
      min-width: 1.5em;
      height: 1.5em;
      fill: mix($color-white, $color-black, 80%);
      fill: mix($color-white, $color-black, 20%);
    }

    + button {
      border-left: 1px solid mix($color-black, $color-white, 80%);
      border-left: 1px solid mix($color-black, $color-white, 20%);
    }
  }
}

.collage__meta {
  position: fixed;
  bottom: 0;
  right: 0;
  z-index: 99;
  color: #fff;
  font-size: 0.875em;
  font-weight: bold;
  padding: 0.25em 0.5em;
  background: rgba(0, 0, 0, 0.5);
}

.wayback {
  position: absolute;
  width: 80%;
  height: 80%;
  top: 10%;
  left: 10%;
  z-index: 1;
  background-color: #fff;
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.3);
}

.collage__search {
  position: absolute;
  left: 50%;
  transform: translate3d(-50%, 0, 0);
  bottom: 3.4em;
  width: auto;
  height: 3.625em;

  z-index: 1;

  &.slide-fade-up-leave-to {
    transform: translate3d(-50%, 100%, 0) !important;
  }

  &.slide-fade-up-enter {
    transform: translate3d(-50%, 100%, 0);
  }

  > form {
    display: flex;
    align-items: stretch;
    height: 100%;
  }

  input[type='text'] {
    font-family: $font-main;
    font-size: 1.4em;
    font-weight: 600;
    padding: 0.75em 8em 0.75em 1.25em;
    border: 0;
    border-radius: 1.5em;
    color: mix($color-white, $color-black, 25%);
    min-width: 30vw;
    height: 100%;
    box-shadow: 0 0.25em 0.5em rgba(0, 0, 0, 0.25);

    &:focus {
      outline: 0;
    }
  }
}

.collage__search__text,
.collage__search__actions {
  position: relative;
}

.collage__search__text {
  margin-right: 1em;
}

.collage__search-submit,
.submit {
  position: absolute;
  right: 0;
  font-family: $font-main;
  //font-weight: 600;
  appearance: none;
  font-size: 1.4em;
  border: 0;
  border-radius: 0 1.5em 1.5em 0;
  padding: 0.75em 1.25em;
  color: white;
  background: $color-red;
  height: 100%;
}

.collage__search-next,
.collage__search-prev,
.collage__search-submit,
.collage__search-close {
  cursor: pointer;

  > svg {
    width: 1em;
    height: 1em;

    :deep(path) {
      fill: $color-white;
    }
  }
}

.collage__search__text {
  flex: 1 1 50%;
}
.collage__search-close {
  margin-left: 1em;
  box-shadow: 0 0.25em 0.5em rgba(0, 0, 0, 0.25);
  position: relative;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  appearance: none;
  background: $color-black;
  border: 0;
  border-radius: 0.5 * 3.625em;
  width: 3.625em;
  height: 100%;

  svg {
    path {
      fill: white;
    }
  }
}

.collage__search__actions {
  display: flex;
  flex-grow: 2;
}

.collage__search-next,
.collage__search-prev {
  box-shadow: 0 0.25em 0.5em rgba(0, 0, 0, 0.25);
  appearance: none;
  border: 0;
  padding: 0;
  height: 100%;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 3.625em;
  background-color: $color-red;
  border-radius: 0.5 * 3.625em;

  &[disabled] {
    opacity: 0.5;
  }

  > svg {
    width: 1.5em;
    height: 1.5em;
  }
}

.collage__search-prev {
  transform: rotate(180deg);
  border-radius: 0 0.5 * 3.625em 0.5 * 3.625em 0;
}
.collage__search-next {
  border-radius: 0 0.5 * 3.625em 0.5 * 3.625em 0;

  > svg {
    transform: rotate(0deg);
  }
}

.collage__search__info {
  position: absolute;
  right: 6em;
  top: 50%;
  transform: translateY(-50%);
  color: mix($color-white, $color-black, 30%);
}

.collage__container {
  height: 100%;
}

@keyframes rotate {
  100% {
    transform: translate3d(0, -50%, 0) rotate(360deg);
  }
}

@keyframes spin {
  0%,
  25% {
    stroke-dashoffset: 280;
    transform: rotate(0);
  }

  50%,
  75% {
    stroke-dashoffset: 75;
    transform: rotate(45deg);
  }

  100% {
    stroke-dashoffset: 280;
    transform: rotate(360deg);
  }
}

.collage__search__spinner {
  position: absolute;
  width: 2.25em;
  height: 2.25em;
  right: 6em;
  top: 50%;
  z-index: 1;
  transform: translate3d(0, -50%, 0);
  animation: rotate 1.5s linear infinite;

  > svg {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;

    circle {
      stroke: $color-red;
      stroke-width: 8px;
      stroke-linecap: square;
      animation: spin 2s ease-in-out infinite;
      stroke-dasharray: 283;
      stroke-dashoffset: 280;
      transform-origin: 50% 50%;
    }
  }
}
</style>
<style lang="scss">
@import '../assets/css/variables';

.search-results-mask {
  stroke: white;
  stroke-width: 50px;
}
.viewer-webarchive__result__button {
  appearance: none;
  border-radius: 2em;
  border: 0;
  background: $color-red;
  color: #fff;
  padding: 0.5em 1em;
  cursor: pointer;
  font-weight: bold;
  pointer-events: all;
}
.viewer-webarchive__result-actions--hidden {
  > button {
    display: none;
  }
}
</style>
