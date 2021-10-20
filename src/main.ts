import * as Discord from 'discord.js';
import * as Bot from './bot';
import UtilityModule from './modules/utility';
import SearchModule from './modules/search';
import ListModule from './modules/list';
import UpdatesModule from './modules/updates';
import TriviaModule from './modules/trivia';

const bot = new Bot.Bot(new Discord.Client());

bot.addModule(new UtilityModule(bot));
bot.addModule(new SearchModule(bot));
bot.addModule(new ListModule(bot));
bot.addModule(new UpdatesModule(bot));
bot.addModule(new TriviaModule(bot));

bot.login();


