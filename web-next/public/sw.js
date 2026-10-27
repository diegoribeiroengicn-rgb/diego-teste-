// Service worker mínimo — existe apenas para tornar o GAT Mobile instalável
// na tela inicial (critério do Chrome/Android). Não armazena nada em cache:
// todo o conteúdo é autenticado por sessão, então cachear respostas aqui
// arriscaria vazar dados de um usuário para a sessão de outro no mesmo
// aparelho. Cada requisição sempre vai direto para a rede.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
