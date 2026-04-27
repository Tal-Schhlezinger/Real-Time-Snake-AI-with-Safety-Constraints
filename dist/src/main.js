import { SnakeApp } from './ui/app.js';
const app = document.querySelector('#app');
if (app) {
    new SnakeApp(app).mount();
}
