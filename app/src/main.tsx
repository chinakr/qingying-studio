import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// QA 钩子：桌面壳冒烟测试时由 Rust 侧 eval 调用，正常使用不会触发
declare global {
  interface Window {
    __tfSmoke?: () => void;
  }
}
window.__tfSmoke = () => {
  void import('./smoke').then((m) => m.runSmoke());
};
