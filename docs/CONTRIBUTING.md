# Contributing to Collab

Thanks for your interest in contributing! Here's how to help.

---

## Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/collab.git`
3. **Create a branch**: `git checkout -b feature/my-feature`
4. **Setup** development environment: See [GETTING_STARTED.md](./GETTING_STARTED.md)
5. **Make changes** and test locally
6. **Push** to your fork
7. **Open a Pull Request** against `develop` branch

---

## Development Workflow

### Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: ESLint + Prettier (auto-fix: `npm run lint`)
- **Components**: Use `'use client'` only where needed (prefer server components)
- **No console.log()**: Use proper logging or remove before committing

### Git Conventions

**Branch naming:**
```
feature/feature-name         # New features
bugfix/bug-name             # Bug fixes
docs/documentation-update   # Documentation changes
refactor/refactoring-name   # Code refactoring
perf/performance-improvement # Performance improvements
```

**Commit messages:**
```
feat: add message reactions
fix: correct voice channel join bug
docs: update API documentation
refactor: clean up message normalization
perf: optimize message list rendering
```

### Before Pushing

```bash
# Format and lint
npm run lint

# Type check
npm run typecheck

# Run tests
npm test

# Build
npm run build
```

---

## Areas to Contribute

### Frontend (Next.js)

**Easy (Good for beginners):**
- Fix typos in UI
- Improve error messages
- Add loading states
- Update documentation

**Medium:**
- Fix UI bugs in `components/`
- Add new components to `components/ui/`
- Improve accessibility (a11y)
- Add keyboard shortcuts

**Hard:**
- Optimize rendering performance
- Implement new features (chat threads, etc.)
- Improve state management
- Add complex animations

### Backend (Express API)

**Easy:**
- Fix typos in error messages
- Improve logging
- Add validation
- Update API documentation

**Medium:**
- Add new API endpoints
- Improve permission checks
- Add database migrations
- Fix bugs in existing routes

**Hard:**
- Optimize database queries
- Implement complex features (webhooks, etc.)
- Add caching strategies
- Scale for 1000+ users

### Database (Drizzle ORM)

**Easy:**
- Add missing indexes
- Improve schema documentation

**Medium:**
- Create migrations for new features
- Optimize schema for performance

**Hard:**
- Handle complex data migrations
- Design schema for new features

### Documentation

**Always needed:**
- Typo fixes
- Clarification of confusing sections
- Adding examples
- Updating outdated information
- Translating to other languages

### Testing

**Easy:**
- Write unit tests for utility functions
- Add integration tests for API routes

**Medium:**
- Improve test coverage
- Add end-to-end tests (Playwright)

**Hard:**
- Optimize test performance
- Implement visual regression testing

---

## Pull Request Process

1. **Base branch**: `develop` (NOT `main`)
2. **Description**: Explain what you changed and why
3. **Tests**: Include tests for new features
4. **Screenshots**: For UI changes, include before/after screenshots
5. **Checklist**:
   ```markdown
   - [ ] I've tested this locally
   - [ ] I've updated documentation
   - [ ] I've added/updated tests
   - [ ] No console.log() or debug code left
   - [ ] I've run `npm run lint`
   ```

### Example PR Description

```markdown
## Description
Fixes #123 - Add emoji reactions to messages

## Changes
- Added `POST /api/messages/:id/reactions` endpoint
- Added `DELETE /api/messages/:id/reactions/:emoji` endpoint
- Added reaction UI in MessageItem component
- Added reaction count display

## Testing
- Manual testing on localhost:3000
- All tests passing: `npm test`

## Screenshots
[Before] [After with reactions]
```

---

## Code Review

All PRs require approval before merging.

**Reviewers will check:**
- Code quality and style
- TypeScript types are correct
- Tests are present and meaningful
- Documentation is updated
- No breaking changes
- Performance impact
- Security issues

**Be prepared to:**
- Respond to feedback
- Make requested changes
- Explain your reasoning

---

## Reporting Issues

### Bug Reports

```markdown
## Description
Brief description of the bug

## Steps to Reproduce
1. Navigate to...
2. Click...
3. See...

## Expected Behavior
What should happen

## Actual Behavior
What actually happened

## Environment
- OS: macOS / Windows / Linux
- Browser: Chrome / Firefox / Safari
- App version: v0.1.0

## Screenshots
[Attach relevant screenshots]

## Logs
```
Paste error logs or console output
```
```

### Feature Requests

```markdown
## Description
What should be added?

## Motivation
Why would this be useful?

## Examples
How would users use this?

## Alternatives
Any other ways to solve this?
```

---

## Setting Up Your Environment

### Required Tools
- Node.js 18+ ([download](https://nodejs.org/))
- PostgreSQL 14+ ([download](https://postgresql.org/))
- Redis ([download](https://redis.io/))
- Git ([download](https://git-scm.com/))
- Your favorite editor (VS Code recommended)

### VS Code Extensions (Recommended)
- ESLint
- Prettier
- TypeScript Vue Plugin
- Tailwind CSS IntelliSense
- Thunder Client (API testing)
- PostgreSQL (SQL formatting)

### Local Setup

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/collab.git
cd collab

# Install dependencies
npm install

# Create .env
cp .env.example .env

# Start development
npm run dev       # Terminal 1: Frontend
npm run dev:api   # Terminal 2: API
npm run dev:ws    # Terminal 3: WebSocket (optional)
```

See [GETTING_STARTED.md](./GETTING_STARTED.md) for detailed setup.

---

## Testing

### Run Tests

```bash
# All tests
npm test

# Specific file
npm test -- components/chat/ChatWindow.test.tsx

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

### Writing Tests

```typescript
// components/chat/__tests__/ChatWindow.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatWindow } from '../ChatWindow';

describe('ChatWindow', () => {
  it('renders messages', () => {
    render(<ChatWindow channelId="test-id" type="server" />);
    expect(screen.getByText('Messages')).toBeInTheDocument();
  });

  it('sends message on enter', async () => {
    const { getByPlaceholderText } = render(
      <ChatWindow channelId="test-id" type="server" />
    );
    const input = getByPlaceholderText('Type a message...');
    
    await userEvent.type(input, 'Hello');
    await userEvent.keyboard('{Enter}');
    
    // Assert message was sent
  });
});
```

---

## Performance Tips

### Frontend
- Use `React.memo()` for expensive components
- Lazy-load components with `next/dynamic`
- Optimize images with `next/image`
- Profile with Chrome DevTools Performance tab
- Check bundle size: `npm run build`

### API
- Add database indexes for queries
- Use connection pooling
- Cache with Redis
- Query only needed fields
- Profile with `console.time()` / `console.timeEnd()`

### Database
- Add indexes for WHERE clauses
- Avoid N+1 queries (use relations/joins)
- Partition large tables by date
- Vacuum and analyze regularly

---

## Documentation

### When to Update Docs
- Adding a new feature
- Changing API behavior
- Adding a new API endpoint
- Fixing a confusing part
- Adding a new architecture decision

### Documentation Files
- **README.md** - Project overview
- **docs/GETTING_STARTED.md** - Setup guide
- **docs/API.md** - API reference
- **docs/ARCHITECTURE.md** - Architecture decisions
- **DEPLOY.md** - Deployment guide
- **ENV.md** - Environment variables
- **CHANGELOG.md** - Version history

### Markdown Style
- Use `###` for headers (not `#`)
- Code blocks with language: ` ```typescript `
- Links: `[text](./relative/path.md)`
- Inline code: `variable` (backticks)
- Bold for emphasis: `**important**`

---

## Release Process

Only maintainers can release new versions.

1. Update `package.json` version (semver)
2. Update `CHANGELOG.md`
3. Create commit: `chore: release v0.2.0`
4. Create git tag: `v0.2.0`
5. Push: `git push && git push --tags`
6. GitHub creates release automatically

---

## Code of Conduct

- Be respectful and inclusive
- No discrimination or harassment
- Focus on the code, not the person
- Assume good intentions
- Report violations to maintainers

---

## Questions?

- **Discussions**: [GitHub Discussions](https://github.com/lapinex/collab/discussions)
- **Issues**: [GitHub Issues](https://github.com/lapinex/collab/issues)
- **Docs**: [Full Documentation](.)

---

## Common Mistakes to Avoid

❌ **Don't:**
- Commit `node_modules` or `.env` files
- Use `any` type in TypeScript
- Leave `console.log()` in code
- Create massive PRs (100+ files)
- Merge without tests
- Hardcode credentials
- Ignore linting errors

✅ **Do:**
- Test locally before pushing
- Follow naming conventions
- Write clear commit messages
- Keep commits focused
- Ask questions if unsure
- Review your own PR first
- Update documentation

---

**Thank you for contributing! 🙏**
