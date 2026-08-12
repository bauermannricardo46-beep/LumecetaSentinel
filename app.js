const views = ['overview','portfolio','watchlist','signals'];
const titles = {overview:'Overview', portfolio:'Portfolio', watchlist:'Watchlist', signals:'Signals'};
const showView = (name) => {
  if (!views.includes(name)) return;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  document.getElementById(`view-${name}`).classList.add('active-view');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.getElementById('page-title').textContent = titles[name];
  history.replaceState(null, '', `#${name}`);
};
document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('[data-view-target]').forEach(button => button.addEventListener('click', () => showView(button.dataset.viewTarget)));
const toast = document.getElementById('toast');
document.getElementById('refresh').addEventListener('click', () => {
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1600);
});
window.addEventListener('hashchange', () => showView(location.hash.slice(1) || 'overview'));
showView(location.hash.slice(1) || 'overview');
