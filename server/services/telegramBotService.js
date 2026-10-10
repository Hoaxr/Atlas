const { Bot } = require('node-telegram-bot-api');
const { getSetting } = require('../utils/settings');
const tmdbService = require('./tmdbService');
const libraryService = require('./libraryService');

class TelegramBotService {
  constructor() {
    this.bot = null;
    this.chatId = null;
  }

  init() {
    // Stop any existing polling bot instance first
    if (this.bot) {
      try {
        if (typeof this.bot.stop === 'function' && this.bot.isRunning()) {
          this.bot.stop();
        }
      } catch { /* ignore */ }
      this.bot = null;
    }

    const token = getSetting('telegramBotToken');
    const chatId = getSetting('telegramChatId');

    if (!token || !chatId) {
      console.log('[TelegramBot] Not initialized: Token or Chat ID is missing.');
      return;
    }

    this.chatId = String(chatId);
    this.bot = new Bot(token);

    console.log('[TelegramBot] Initialized interactive bot (v2).');

    // Handle polling & runtime errors gracefully
    this.bot.catch((error) => {
      // 409 Conflict means another Atlas instance is polling with the same token
      if (String(error?.message || '').includes('409') || error?.code === 409) return;
      console.error(`[TelegramBot] Error: ${error?.message || error}`);
    });

    // Guard: Only allow interaction from the configured trusted chatId
    this.bot.use(async (ctx, next) => {
      if (ctx.chatId !== undefined && String(ctx.chatId) !== this.chatId) {
        return; // Ignore messages from unauthorized chats
      }
      await next();
    });

    // /start and /help commands
    this.bot.command(['start', 'help'], async (ctx) => {
      await ctx.reply("Welcome to Atlas! Send me the name of a movie or TV show, and I'll find it for you.");
    });

    // /request <query> or /search <query>
    this.bot.command(['request', 'search'], async (ctx) => {
      const query = typeof ctx.match === 'string' ? ctx.match.trim() : '';
      if (query) {
        await this.handleSearch(ctx, query);
      } else {
        await ctx.reply('Please provide a title to search for (e.g. /search Inception).');
      }
    });

    // Plain text queries (not starting with '/')
    this.bot.on('message', async (ctx) => {
      const text = ctx.message?.text;
      if (text && !text.startsWith('/')) {
        await this.handleSearch(ctx, text);
      }
    });

    // Callback queries for interactive inline buttons
    this.bot.on('callback_query', async (ctx) => {
      await this.handleCallbackQuery(ctx);
    });

    // Start background polling loop
    this.bot.startPolling().catch((error) => {
      if (String(error?.message || '').includes('409') || error?.code === 409) return;
      console.error(`[TelegramBot] Polling failed: ${error?.message || error}`);
    });
  }

  async handleSearch(ctx, query) {
    if (!query || query.trim().length === 0) return;

    await ctx.reply(`🔍 Searching for "${query}"...`);

    try {
      const results = await tmdbService.searchMulti(query);

      if (!results || results.length === 0) {
        await ctx.reply(`❌ No results found for "${query}".`);
        return;
      }

      // Take top 3 results to avoid spamming the chat
      const topResults = results.slice(0, 3);

      for (const item of topResults) {
        const type = item.media_type === 'movie' ? 'Movie' : 'TV Show';
        const year = (item.release_date || item.first_air_date || '').split('-')[0] || 'Unknown';
        const title = item.title || item.name;

        let text = `*${title}* (${year})\n${type} ⭐️ ${item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}\n\n`;
        text += item.overview ? `${item.overview.substring(0, 200)}...` : 'No overview available.';

        const replyMarkup = {
          inline_keyboard: [[
            {
              text: `📥 Request ${type}`,
              callback_data: `req:${item.media_type}:${item.id}`
            }
          ]]
        };

        if (item.poster_path) {
          const posterUrl = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
          await this.bot.api.sendPhoto({
            chat_id: ctx.chatId,
            photo: posterUrl,
            caption: text,
            parse_mode: 'Markdown',
            reply_markup: replyMarkup
          });
        } else {
          await ctx.reply(text, {
            parse_mode: 'Markdown',
            reply_markup: replyMarkup
          });
        }
      }
    } catch (err) {
      console.error('[TelegramBot] Search error:', err.message);
      await ctx.reply(`❌ An error occurred while searching.`);
    }
  }

  async handleCallbackQuery(ctx) {
    const callbackQuery = ctx.callbackQuery;
    const data = callbackQuery?.data;
    if (!data) return;

    if (data.startsWith('req:')) {
      const parts = data.split(':');
      const type = parts[1]; // movie or tv
      const tmdbId = parts[2];

      try {
        if (type === 'movie') {
          await libraryService.addMovie(tmdbId);
          setTimeout(() => {
            require('./automationService').runSearchCycle().catch(err => console.error('[TelegramBot] Auto-search failed:', err));
          }, 1000);
        } else {
          const res = await libraryService.addShow(tmdbId);
          const eventBus = require('./eventBus');
          const onEvent = (event) => {
            if (event.message === 'Episodes synced' && event.metadata?.showId === res.id) {
              require('./automationService').runSearchCycle().catch(err => console.error('[TelegramBot] Auto-search failed:', err));
              eventBus.off('event', onEvent);
            }
          };
          eventBus.on('event', onEvent);
          setTimeout(() => eventBus.off('event', onEvent), 60000);
        }

        // Edit the original message to reflect confirmation
        const msg = callbackQuery.message;
        const existingText = msg ? (msg.caption || msg.text || '') : '';
        const newText = `${existingText}\n\n✅ *Successfully requested!*`;

        if (msg?.photo) {
          await this.bot.api.editMessageCaption({
            chat_id: ctx.chatId,
            message_id: msg.message_id,
            caption: newText,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] }
          });
        } else if (msg) {
          await this.bot.api.editMessageText({
            chat_id: ctx.chatId,
            message_id: msg.message_id,
            text: newText,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] }
          });
        }

        await ctx.answerCallbackQuery({ text: 'Request added to library!' });
      } catch (err) {
        console.error('[TelegramBot] Request error:', err.message);
        await ctx.answerCallbackQuery({ text: 'Failed to add request. It might already exist.', show_alert: true });
      }
    }
  }
}

module.exports = new TelegramBotService();
