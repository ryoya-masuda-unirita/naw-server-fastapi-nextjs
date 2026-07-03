import { Routes } from '@angular/router';

export const CHAT_ROUTES: Routes = [
  {
    path: 'viewer/:chatId',
    loadComponent: () =>
      import('./pages/chat-viewer/chat-viewer.component').then((m) => m.ChatViewerComponent),
    title: 'Chat Viewer',
  },
  {
    path: 'share/:shareId',
    loadComponent: () =>
      import('./pages/chat-shared/chat-shared.component').then((m) => m.ChatSharedComponent),
    title: 'Shared Chat',
  },
  {
    path: '',
    redirectTo: '/admin/chat/new',
    pathMatch: 'full',
  },
];
