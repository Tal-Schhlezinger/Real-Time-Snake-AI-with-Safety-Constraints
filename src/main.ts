import { SnakeApp } from './ui/app.js';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  new SnakeApp(app).mount();
}
