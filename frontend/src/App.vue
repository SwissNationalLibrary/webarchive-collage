<template>
  <div id="app-container">
    <header class="app-header" v-if="!isDemo">
      <h1>
        <IconHelvetica />
        <span
          >Web Archive Switzerland &middot; Webarchiv Schweiz &middot; Archives
          Web Suisse &middot; Archivio Web Svizzera &middot; Archiv Web
          Svizra</span
        >
      </h1>
    </header>

    <main class="app-canvas">
      <Collage
        v-if="
          isConfigLoaded &&
          isAuthStatusLoaded &&
          appConfig.collages &&
          appConfig.collages.length > 0
        "
        :isRestricted="isRestricted"
        :collage="appConfig.collages[0]"
        :config="appConfig.config"
        :collageMeta="appConfig.collages[0]"
        :dataBaseUrl="dataBaseUrl"
        :iiifBaseUrl="iiifBaseUrl"
        :isAuthenticated="isAuthenticated"
        :userData="userData"
        :isCasting="isCasting"
        :castReceiverName="castReceiverName"
        :isCastLoaded="isChromecastLoaded"
        :isDemo="isDemo"
        @login="openDialog"
        @logout="doLogout"
        @startChromecast="triggerChromecast"
      />
      <div class="loading" v-else>
        <p v-if="!loadingError" class="loading-text">{{ loadingText }}</p>
        <p v-else class="loading-text">{{ loadingError }}</p>
      </div>
    </main>

    <a11y-dialog
      id="app-login-dialog"
      dialog-root="#dialog-root"
      @dialog-ref="assignDialogRef"
      :class-names="{
        closeButton: 'app-login__close',
        container: 'dialog-container',
        content: 'dialog-content',
        title: 'dialog-title',
      }"
    >
      <template v-slot:title
        ><h1>Anmeldung für Bibliotheken und Archive</h1></template
      >

      <template v-slot:closeButtonContent>
        <span>Schliessen</span>
      </template>

      <form class="app-login__form">
        <div class="app-login__form__error" v-if="loginErrorMsg">
          {{ loginErrorMsg }}
        </div>

        <div class="app-login__user">
          <label for="app-login__user__label">BenutzerIn</label>
          <input
            type="text"
            id="app-login__user__label"
            name="username"
            v-model="loginUsername"
          />
        </div>
        <div class="app-login__password">
          <label for="app-login__password__label">Passwort</label>
          <input
            type="password"
            id="app-login__password__label"
            name="password"
            v-model="loginPassword"
          />
        </div>

        <div class="app-login__actions">
          <button class="app-login__button--primary" @click.prevent="doLogin">
            Anmelden
          </button>
          <button class="app-login__button" @click.prevent="cancelLogin">
            Abbrechen
          </button>
        </div>
      </form>
    </a11y-dialog>
  </div>
</template>

<script lang="ts">
import Collage from './components/Collage.vue';
import IconHelvetica from './assets/icons/helvetica.svg';
import 'whatwg-fetch';
import { A11yDialog } from 'vue-a11y-dialog';
import './assets/css/global.scss';

export default {
  name: 'App',
  components: {
    Collage,
    IconHelvetica,
    'a11y-dialog': A11yDialog,
  },

  data() {
    return {
      isConfigLoaded: false,
      isAuthStatusLoaded: false,
      isDemo: false,
      appConfig: {},
      loadingError: null,
      loadingText: 'Konfiguration laden...',
      iiifBaseUrl: '/iiif/2',
      dataBaseUrl: '',
      dialog: null,
      loginUsername: null,
      loginPassword: null,
      loginErrorMsg: null,
      isAuthenticated: false,
      isRestricted: false,
      isCasting: false,
      castType: null,
      castReceiverName: null,
      chromecastSession: null,
      isChromecastLoaded: false,
      isChromecastInitialized: false,
      userData: {
        email: null,
        id: null,
        roles: [],
      },
    };
  },

  async created() {
    this.isRestricted = this.getUrlParameter('embed') === 'restricted';
    this.isDemo = this.getUrlParameter('demo')?.length > 0;

    this.dataBaseUrl =
      document.location.pathname == '/'
        ? '/data'
        : document.location.pathname + '/data';
    this.iiifBaseUrl =
      document.location.pathname == '/'
        ? '/iiif/2'
        : document.location.pathname + '/iiif/2';
    await this.fetchConfig();
    await this.fetchAuthenticationStatus();
  },

  computed: {
    apiBase() {
      return this.appConfig?.config?.apiBase;
    },
  },

  methods: {
    // see https://davidwalsh.name/query-string-javascript and aframe.io
    getUrlParameter(name) {
      name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
      const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
      const results = regex.exec(location.search);
      return results === null
        ? ''
        : decodeURIComponent(results[1].replace(/\+/g, ' '));
    },
    async fetchConfig() {
      const url = `${this.dataBaseUrl}/config.json`;
      return fetch(url)
        .then((response) => {
          return response.json();
        })
        .then((config) => {
          console.log('config loaded', config);
          this.appConfig = config;
          this.isConfigLoaded = true;
        })
        .catch((e) => {
          console.error(e);
          this.loadingError = `Webarchive collage failed to load: Cannot load configuration from ${url} (${e})`;
        });
    },
    async postLogin(username, password) {
      return fetch(`${this.apiBase}/auth/login`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', //CSRF
        },
        body: JSON.stringify({ email: username, password }),
      })
        .then((response) => {
          console.log('response is ', response);
          return response.json();
        })
        .then((data) => {
          console.log('success - login data', data);
          this.loginUsername = null;
          this.loginPassword = null;
          this.loginErrorMsg = null;
          return data;
        })
        .catch((e) => {
          console.error('caught login error', e);
          this.loginErrorMsg = 'Login fehlgeschlagen';
        });
    },
    async postLogout() {
      return fetch(`${this.apiBase}/auth/logout`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          // 'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', //CSRF
        },
        body: JSON.stringify({}),
      }).then((response) => {
        if (response.status >= 200 && response.status < 300) {
          this.userData.email = null;
          this.userData.id = null;
          this.userData.roles = [];
        }
        return response.statusText;
      });
    },
    async doLogin() {
      this.loginErrorMsg = null;
      const result = await this.postLogin(
        this.loginUsername,
        this.loginPassword,
      );
      console.log(result);
      if (result?.email) {
        this.isAuthenticated = true;
        this.userData = {
          email: result.email,
          id: result.id,
          roles: result.roles,
        };
        this.dialog?.hide();
      }
    },

    async doLogout() {
      const result = await this.postLogout();
      this.isAuthenticated = false;
      console.log('doLogout result=', result);
    },

    cancelLogin() {
      this.dialog?.hide();
    },
    chromecastStartSession() {
      const chrome = window.chrome;
      chrome.cast.requestSession(
        (data) => {
          console.log('session request success', data);
          /* if successful: data = {
          appId: "CC1AD845"
          appImages: []
          displayName: "Default Media Receiver"
          media: []
          namespaces: Array(4)
          0: {name: "urn:x-cast:com.google.cast.cac"}
          1: {name: "urn:x-cast:com.google.cast.debugoverlay"}
          2: {name: "urn:x-cast:com.google.cast.broadcast"}
          3: {name: "urn:x-cast:com.google.cast.media"}
          length: 4
          __proto__: Array(0)
          receiver: {capabilities: Array(1), displayStatus: null, friendlyName: "NX Lab", isActiveInput: null, label: "JWG9pnKOxOXvHS96LOndVcPsZPI", …}
          senderApps: []
          sessionId: "965f3e2f-f4ac-4e3a-b33a-da18b77f52c9"
          status: "connected"
          statusText: "Default Media Receiver"
          transportId: "965f3e2f-f4ac-4e3a-b33a-da18b77f52c9"
          } */
          if (data?.status === 'connected') {
            this.isCasting = true;
            this.castType = 'chromecast';
            this.castReceiverName = data?.receiver?.friendlyName;
          }
        },
        (err) => {
          console.log('session request success', err);
        },
      );
    },
    chromecastCallback(isAvailable) {
      console.log('chromecastCallback called', isAvailable);
      if (isAvailable) {
        const cast = window.cast;
        const chrome = window.chrome;
        const castContext = cast.framework.CastContext.getInstance();
        castContext.setOptions({
          autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
          receiverApplicationId:
            chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        });

        console.log('castContext', castContext);
        this.isChromecastInitialized = true;
        this.chromecastStartSession();
      }
    },
    triggerChromecast() {
      console.log('triggerChromecast');

      if (!this.isChromecastLoaded) {
        window.__onGCastApiAvailable = this.chromecastCallback.bind(this);
        const script = document.createElement('script');
        script.setAttribute('type', 'text/javascript');
        script.setAttribute(
          'src',
          '//www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1',
        );
        (
          document.getElementsByTagName('head')[0] || document.documentElement
        ).appendChild(script);
        console.log(script);
        this.isChromecastLoaded = true;
      }
    },
    async fetchAuthenticationStatus() {
      return fetch(`${this.apiBase}/users/me`, {
        //credentials: 'same-origin',
        credentials: 'include',
      })
        .then((response) => {
          return response.json();
        })
        .then((data) => {
          this.isAuthenticated = false;
          this.userId = null;
          this.userRoles = [];
          this.userEmail = null;
          if (data.email) {
            this.isAuthenticated = true;
            this.userData.email = data.email;
            this.userData.id = data.id;
            this.userData.roles = data.role_ids;
          }
        })
        .catch(() => {
          this.isAuthenticated = false;
          this.userData = {
            email: null,
            id: null,
            roles: [],
          };
        })
        .finally(() => {
          this.isAuthStatusLoaded = true;
        });
    },

    openDialog() {
      console.log('openDialog', this.dialog);
      if (this.dialog) {
        this.dialog.show();
      }
    },

    assignDialogRef(dialog) {
      this.dialog = dialog;
    },

    beforeDestroy() {
      // @TODO unload chromecast
      // if (this.isCastLoaded) {
      //   const el = document.querySelector('script[src^=//www.gstatic.com/cv/sender]');
      // }
    },
  },
};
</script>

<style lang="scss">
#app {
  font-family: 'Frutiger LT', 'Arial', 'Helvetica', 'sans-serif';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  width: 100%;
  height: 100%;
}
</style>
<style lang="scss" scoped>
@import 'assets/css/variables';
#app-container {
  width: 100%;
  height: 100%;
}
.app-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2em;
  color: #fff;
  height: 100%;
}
.app-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2.625em;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: left;
  padding-left: 1em;
  background-color: rgba($color-black, 0.7);
  background-color: rgba($color-white, 0.95);
  border-bottom: 3px solid $color-red;

  //border-bottom: 2px solid $color-red;
  box-sizing: content-box;

  > h1 {
    font-size: 1em;
    text-align: center;
    color: $color-black;
    display: flex;
    align-items: center;

    > svg {
      width: 1em;
      margin-right: 0.75em;
    }
  }
}

label {
  font-weight: bold;
  margin-bottom: 0.25em;
}

input[type='text'],
input[type='password'] {
  font-size: 1em;
  padding: 0.75em 1em;
  border: 1px solid mix($color-white, $color-black, 70%);
  border-radius: 3px;
}

.app-login__password,
.app-login__user {
  display: flex;
  flex-direction: column;
  margin-top: 1em;
}

.app-login__form__error {
  font-weight: bold;
  color: $color-red;
}

.app-login__actions {
  margin-top: 1em;
  display: flex;
  flex-direction: row-reverse;
  justify-content: space-between;

  > button {
    appearance: none;
    background: none;
    font-weight: bold;
    padding: 0.75em 1.5em;
    border: 1px solid mix($color-white, $color-black, 80%);
    cursor: pointer;
    //border-radius: 2em;

    &.app-login__button--primary {
      border: 1px solid $color-blue;
      background: $color-blue;
      color: $color-white;
    }
  }
}
</style>
