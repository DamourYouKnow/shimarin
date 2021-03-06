import * as Discord from 'discord.js';
import * as AniList from './anilist';
import * as Bot from './bot';


const bot = new Bot.Bot(new Discord.Client());
bot.login();

bot.commands.add({name: 'ping'}, (message) => {
    message.channel.send('pong!');
});

bot.commands.add({name: 'watching'}, async (message, username) => {
    const user = await AniList.searchUser(username);
    const mediaList = await AniList.getMediaListPage(
        user.id,
        'ANIME',
        'CURRENT'
    );
    const response = await message.channel.send(
        mediaListEmbed(user, mediaList)
    );
    new Bot.EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                user,
                await AniList.getMediaListPage(
                    user.id,
                    'ANIME',
                    'CURRENT',
                    page
                )
            );
        }
    ).listen();
});

bot.commands.add({name: 'reading'}, async (message, username) => {
    const user = await AniList.searchUser(username);
    const mediaList = await AniList.getMediaListPage(
        user.id,
        'MANGA',
        'CURRENT'
    );
    const response = await message.channel.send(
        mediaListEmbed(user, mediaList)
    );
    new Bot.EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                user,
                await AniList.getMediaListPage(
                    user.id,
                    'MANGA',
                    'CURRENT',
                    page
                )
            );
        }
    ).listen();
});

bot.commands.add({name: 'list'}, async (message, username, ...args) => {
    const argSet = new Set(args);
    
    let type: AniList.MediaListType = 'ANIME';
    if (argSet.has('manga')) type = 'MANGA';

    let status: AniList.MediaListStatus = 'COMPLETED';
    if (argSet.has('watching')) status = 'CURRENT';
    if (argSet.has('dropped')) status = 'DROPPED';
    if (argSet.has('planned')) status = 'PLANNING';

    const user = await AniList.searchUser(username);
    const mediaList = await AniList.getMediaListPage(user.id, type, status, 0);
    const response = await message.channel.send(
        mediaListEmbed(user, mediaList)
    );
    new Bot.EmbedNavigator(
        response,
        message.author,
        mediaList.pageInfo,
        async (page) => {
            return mediaListEmbed(
                user,
                await AniList.getMediaListPage(user.id, type, status, page)
            )
        }
    ).listen();
});

function mediaListEmbed(
    user: AniList.User,
    mediaList: AniList.MediaListPage
): Discord.MessageEmbed {
    const colors: {[color: string]: string}  = {
        'blue': '#3db4f2',
        'purple': '#c063ff', 
        'pink': '#fc9dd6',
        'orange': '#ef881a',
        'red': '#e13333', 
        'green': '#4cca51',
        'gray': '#677b94'
    };

    const profileColor = user.options.profileColor || '#dec027';
    const embedColor = profileColor.startsWith('#') ?
        profileColor : colors[profileColor];

    const fields = mediaList.entries.map((entry) => {
        const media = entry.media;
        const resource = `${mediaList.type.toLowerCase()}/${entry.media.id}/`;
        const url = `https://anilist.co/${resource}`;
        const maxCount = { 
            'ANIME': media.episodes, 'MANGA': media.chapters
        }[mediaList.type];
        const count = `${entry.progress} / ${maxCount || '?'}`;
        const title = media.title.english
            || media.title.romaji 
            || media.title.native
        return {
            name: title,
            value: `${count.padEnd(15, ' ')}[Link](${url})`
        }
    });

    const listLabels: {
        [type in AniList.MediaListType]: {
            [status in AniList.MediaListStatus]: string
        }
    } = {
        'ANIME': {
            'COMPLETED': 'completed anime list',
            'CURRENT': 'watchlist',
            'DROPPED': 'dropped anime list',
            'PAUSED': 'paused anime list',
            'PLANNING': 'plan to watch list',
            'REPEATING': 're-watching list'
        },
        'MANGA': {
            'COMPLETED': 'completed manga list',
            'CURRENT': 'readlist',
            'DROPPED': 'dropped manga list',
            'PAUSED': 'paused manga list',
            'PLANNING': 'plan to read list',
            'REPEATING': 're-reading list'
        }
    };

    const currentPage = mediaList.pageInfo.currentPage;
    const lastPage = mediaList.pageInfo.lastPage;

    return new Discord.MessageEmbed({
        color: embedColor,
        title: `${user.name}'s ${listLabels[mediaList.type][mediaList.status]}`,
        url: `https://anilist.co/user/${user.name}/animelist/Watching`,
        thumbnail: {
            url: user.avatar.medium,
        },
        fields: fields,
        footer: {
            text: `Page ${currentPage} / ${lastPage}`
        }
    });
}
