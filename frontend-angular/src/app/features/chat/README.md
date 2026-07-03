# Chat Feature

This chat feature implements a modern AI-powered chat interface using Angular 21 standalone components, Tailwind CSS, and Angular Signals for state management.

## Features

- ✅ Real-time messaging with AI assistant
- ✅ File attachment support (images, PDFs, documents)
- ✅ Drag & drop file upload
- ✅ Markdown rendering for AI responses
- ✅ Table display support in AI messages
- ✅ Code syntax highlighting
- ✅ Auto-scroll to latest message
- ✅ Message actions (copy, regenerate)
- ✅ File preview panel
- ✅ Responsive design
- ✅ Internationalization (English & Japanese)
- ✅ Keyboard shortcuts (Ctrl+Enter to send)

## Structure

```
chat/
├── components/
│   ├── chat-window/           # Main chat container
│   ├── chat-message-list/     # Scrollable message list
│   ├── chat-message-item/     # Individual message display
│   ├── chat-input/            # Message input with file upload
│   └── chat-file-preview/     # File preview panel
├── pages/
│   └── chat-shell/            # Main page layout
├── services/
│   └── chat.service.ts        # State management with signals
└── chat.routes.ts             # Feature routing
```

## Usage

### Routing

The chat feature is accessible at:
- `/admin/chat` - Main chat interface

### State Management

The `ChatService` uses Angular Signals for reactive state management:

```typescript
// Access current messages
const messages = chatService.messages();

// Send a message
chatService.sendMessage('Hello AI!', files);

// Create new chat room
chatService.createNewRoom();

// Toggle pin
chatService.togglePinRoom(roomId);
```

### Components

#### ChatShellComponent
Main container that hosts the chat window and optional file preview panel.

#### ChatWindowComponent
Contains the message list, input area, and header with room information.

#### ChatMessageListComponent
Displays messages with auto-scroll functionality. Shows loading indicator for AI responses.

#### ChatMessageItemComponent
Renders individual messages with conditional styling based on role (user/assistant).
- User messages: Right-aligned, blue background
- AI messages: Left-aligned, white background, markdown support

#### ChatInputComponent
Multi-line textarea with file upload support:
- Drag & drop files
- Keyboard shortcuts
- File preview with removal
- Auto-resize textarea

#### ChatFilePreviewComponent
Right panel showing attached files with preview for images and download/remove actions.

## Customization

### Styling
All styles use Tailwind CSS utility classes. Key colors:
- Primary: `blue-500`
- User message: `blue-500` background
- AI message: `white` background with `gray-200` border
- Accent: `purple-500` for AI avatar

### Mock Data
Edit `chat.service.ts` to modify mock chat rooms and messages. Replace with actual API calls when backend is ready.

### Markdown Rendering
The `ChatMessageItemComponent` includes basic markdown rendering. For production, consider using:
- `marked` - Full markdown parser
- `ngx-markdown` - Angular markdown component
- Custom renderer for specific requirements

## Testing

To test the chat feature:

1. Navigate to `/admin/chat`
2. Type a message in the input area
3. Press Enter or click Send
4. AI will respond after ~1.5 seconds (simulated delay)
5. Try attaching files via drag & drop or file button
6. Click on file preview button to view attached files

## Internationalization

Translation keys are defined in:
- `src/assets/i18n/en.json` - English
- `src/assets/i18n/ja.json` - Japanese

All UI text uses `TranslateModule` pipes:
```html
{{ 'CHAT.INPUT.PLACEHOLDER' | translate }}
```

## Angular 21 Features Used

- ✅ Standalone components
- ✅ Signal-based state management
- ✅ `input.required<T>()` and `output<T>()`
- ✅ `computed()` for derived state
- ✅ `inject()` function for DI
- ✅ `@if`, `@for` control flow
- ✅ `ChangeDetectionStrategy.OnPush`
- ✅ `host` metadata for host bindings
- ✅ `viewChild()` for element references
- ✅ Separate template files (no inline templates)

## Future Enhancements

- [ ] WebSocket support for real-time updates
- [ ] Voice input/output
- [ ] Advanced markdown editor
- [ ] Message search functionality
- [ ] Export chat history
- [ ] Message threading
- [ ] User mentions/tagging
- [ ] Rich text formatting toolbar
- [ ] Emoji picker
- [ ] Message reactions

## Dependencies

Required packages:
- `@angular/core` - Angular framework
- `@angular/common` - Common Angular modules
- `@angular/material` - Material icons
- `@ngx-translate/core` - Internationalization
- `tailwindcss` - Utility-first CSS framework

Optional (for production):
- `marked` - Markdown parsing
- `highlight.js` - Code syntax highlighting
- `ngx-markdown` - Angular markdown component

## Notes

- The sidebar implementation is assumed to be already complete (as noted in the plan)
- Mock data is used for demonstration - replace with actual API calls
- File uploads are simulated with local URLs - implement proper backend integration
- Markdown rendering is basic - enhance with a proper library for production use
