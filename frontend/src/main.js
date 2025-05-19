import 'classlist-polyfill';
//import Vuei18n from 'vue-i18n';
//import messages from '@/lang/en'
import App from './App.vue';
import A11yDialog from 'vue-a11y-dialog';
import { createApp } from 'vue';
import './assets/css/global.scss';

// const messages = {
//   en: {
//     loading: {
//       config: 'Loading configuration',
//       index: 'Loading index',
//       metadata: 'Loading metadata',
//     },
//   },
// };

// const i18n = new Vuei18n({
//   locale: 'en',
//   messages
// });

const app = createApp(App);
app.use(A11yDialog);
app.mount('#app');
