import * as Discord from 'discord.js';
import { decode } from 'html-entities';
import { Bot, Module, MessageCollector, MessageEmbed } from '../bot';
import * as AniList from '../anilist';

export default class extends Module {
    constructor(bot: Bot) {
        super(bot);

        this.addCommand({
            name: 'search',
            help: {
                shortDesc: 'Search for information about an anime or manga',
                arguments: {
                    'title': 'Anime or manga title'
                },
                examples: [`search yuru camp`]
            }
        }, async (message) => {
            await search<AniList.Media>(
                bot,
                message,
                async (search, viewer) => {
                    return await AniList.getMediaSearchPage(
                        search,
                        { type: null },
                        0,
                        viewer
                    );
                },
                mediaSearchEmbed,
                mediaEmbed
            );
        });
    
        this.addCommand({
            name: 'anime',
            help: {
                shortDesc: 'Search for information about an anime',
                arguments: {
                    'title': 'Anime title'
                },
                examples: ['anime yuru camp']
            }
        }, async (message) => {
            await search<AniList.Media>(
                bot,
                message,
                async (search, viewer) => {
                    return await AniList.getMediaSearchPage(
                        search,
                        { type: 'ANIME' },
                        0,
                        viewer
                    );
                },
                mediaSearchEmbed,
                mediaEmbed
            );
        });
        
        this.addCommand({
            name: 'manga',
            help: {
                shortDesc: 'Search for information about a manga',
                arguments: {
                    'title': 'Manga title'
                },
                examples: [`manga komi can't communicate`]
            }
        }, async (message) => {
            await search<AniList.Media>(
                bot,
                message,
                async (search, viewer) => {
                    return await AniList.getMediaSearchPage(
                        search,
                        { type: 'MANGA' },
                        0,
                        viewer
                    );
                },
                mediaSearchEmbed,
                mediaEmbed
            );
        });

        this.addCommand({
            name: 'character',
            help: {
                shortDesc: 'Search for information about a character',
                arguments: {
                    'name': 'Character name'
                },
                examples: ['character shimarin']
            }
        }, async (message) => {
            await search<AniList.Character>(
                bot,
                message,
                async (search, viewer) => {
                    return await AniList.getCharacterSearchPage(
                        search,
                        0,
                        viewer
                    );
                },
                characterSearchEmbed,
                characterEmbed
            );
        });
    }
}

async function search<T>(
    bot: Bot,
    message: Discord.Message,
    getResults: (
        search: string, viewer: AniList.Viewer
    ) => Promise<AniList.View<AniList.Page<T>>>,
    createResultsEmbed: (
        bot: Bot, results: AniList.View<AniList.Page<T>>
    ) => Discord.MessageEmbed,
    createEmbed: (
        bot: Bot, view: AniList.View<T>
    ) => Discord.MessageEmbed,
) {
    const search = message.content.split(' ').slice(1).join(' ');
    if (!search) {
        await bot.sendError(
            message.channel,
            'No search query was provided.'
        );
        return;
    }
    const viewer = await AniList.getViewer(message.author.id);
    const resultsView = await getResults(search, viewer);
    const results = resultsView.content.items;
    if (results.length == 0) {
        await bot.sendEmbed(
            message.channel,
            'No results found',
            'Double check your search query and try again.'
        );
        return;
    }
    if (results.length == 1) {
        await message.channel.send(createEmbed(bot, {
            content: results[0],
            viewer: viewer
        }));
        return;
    }

    const response = await message.channel.send(
        createResultsEmbed(bot, resultsView)
    );

    const collector = new MessageCollector(message.channel, message.author);
    collector.onReply = (reply) => {
        const selected = Number(reply.content);
        if (!isNaN(selected) && selected >= 1 && selected <= results.length) {
            response.edit(createEmbed(bot, {
                content: results[selected-1],
                viewer: viewer
            }));
        }
    };
}

function mediaEmbed(
    bot: Bot,
    mediaView: AniList.View<AniList.Media>
): Discord.MessageEmbed {
    const media = mediaView.content;
    return new MessageEmbed({
        title: AniList.mediaDisplayTitle(media.title),
        url: media.siteUrl,
        thumbnail: {
            url: media.coverImage.large,
        },
        description: cleanDescription(media.description, media.siteUrl),
        fields: [
            {
                name: 'Format',
                value: AniList.mediaFormatLabels[media.format],
                inline: true
            },
            {
                name: 'Status',
                value: AniList.mediaStatusLabels[media.type][media.status],
                inline: true
            },
            ...media.averageScore != null ? [{
                name: 'Average score',
                value: `${(media.averageScore / 10).toFixed(1)} / 10`,
                inline: true
            }]: [],
            {
                name: 'Genres',
                value: media.genres.join(', ') || 'None',
                inline: true,
            }
        ]
    }, bot);
} 

function mediaSearchEmbed(
    bot: Bot,
    mediaSearchView: AniList.View<AniList.Page<AniList.Media>>
): Discord.MessageEmbed {
    const mediaList = mediaSearchView.content;
    const viewer = mediaSearchView.viewer;
    const fields = mediaList.items.map((media, i) => {
        let title = AniList.mediaDisplayTitle(media.title, viewer);
        if (media.isAdult) title += ' (NSFW)';
        return {
            name: `${i+1}. ${title}`,
            value: AniList.mediaFormatLabels[media.format] || 'No format'
        };
    });
    return new MessageEmbed({
        title: 'Search results',
        description: 'Enter the number of the content you are looking for.',
        fields: fields
    }, bot);
}

function characterEmbed(
    bot: Bot,
    characterView: AniList.View<AniList.Character>
) {
    const character = characterView.content;
    const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December'
    ];
    const dob = character.dateOfBirth;
    const dobStr = dob && dob.year && dob.month && dob.day ?
        `${months[dob.month - 1]} ${dob.day}, ${dob.year}` : '';

    const fields = [];
    if (dobStr) {
        fields.push({
            name: 'Date of birth',
            value: dobStr,
            inline: true
        });   
    }
    if (character.gender) {
        fields.push({
            name: 'Gender',
            value: character.gender,
            inline: true
        });
    }
    if (character.age) {
        fields.push({
            name: 'Age',
            value: character.age,
            inline: true,
        });
    }
    if (character.media.length > 0) {
        fields.push({
            name: 'Appears in',
            value: character.media.map((media) => {
                const title = AniList.mediaDisplayTitle(media.title);
                return `[${title}](${media.siteUrl})`;
            }).slice(0, 5).join('\n'),
            inline: false
        });
    }

    return new MessageEmbed({
        title: character.name.full,
        url: character.siteUrl,
        thumbnail: {
            url: character.image.large,
        },
        description: cleanDescription(character.description, character.siteUrl),
        fields: fields
    }, bot);
}

function characterSearchEmbed(
    bot: Bot,
    characterSearchView: AniList.View<AniList.Page<AniList.Character>>
) {
    const characters = characterSearchView.content.items;
    const viewer = characterSearchView.viewer;
    const fields = characters.map((character, i) => {
        let name = character.name.full;
        if (character.media.some((media) => media.isAdult)) name += ' (NSFW)';
        return {
            name: `${i+1}. ${name}`,
            value: character.media.length > 0 ?
                AniList.mediaDisplayTitle(character.media[0].title, viewer) :
                'Unknown source'
        };
    });
    return new MessageEmbed({
        title: 'Search results',
        description: 'Enter the number of the character you are looking for.',
        fields: fields
    }, bot);
}

function cleanDescription(text: string, sourceUrl: string): string {
    let description = decode(text)
        .replace(/(<br>)+/g, '\n\n')
        .replace(/(\n\n)+/g, '\n\n')
        .replace(/<i>/g, '*').replace(/<\/i>/g, '*')
        .replace(/<b>/g, '**').replace(/<\/b>/g, '**')
        .replace(/~!/g, '||').replace(/!~/g, '||');

    const descLimit = 1800;
    if (description.length > descLimit) {
        description = description.slice(0, descLimit);
        const spoilerTags = description.match(/\|\|/g);
        if (spoilerTags && spoilerTags.length % 2 != 0) description += '||';
        const readMore = `[Read more](${sourceUrl})`;
        description += `...\n\n[${readMore}]`;
    }
    return description;
}
