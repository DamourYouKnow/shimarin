import * as Discord from 'discord.js';
import { decode } from 'html-entities';
import {
    Bot,
    Module,
    MessageCollector,
    MessageEmbed,
    EmbedNavigator 
} from '../bot';
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
                async (search, page, viewer) => {
                    return await AniList.getMediaSearchPage(
                        search,
                        { type: null },
                        page,
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
                async (search, page, viewer) => {
                    return await AniList.getMediaSearchPage(
                        search,
                        { type: 'ANIME' },
                        page,
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
                async (search, page, viewer) => {
                    return await AniList.getMediaSearchPage(
                        search,
                        { type: 'MANGA' },
                        page,
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
                async (search, page, viewer) => {
                    return await AniList.getCharacterSearchPage(
                        search,
                        page,
                        viewer
                    );
                },
                characterSearchEmbed,
                characterEmbed
            );
        });

        this.addCommand({
            name: 'staff',
            help: {
                shortDesc: 'Search for information about a staff member',
                arguments: {
                    'name': 'Staff member name'
                },
                examples: ['staff yamada naoko']
            }
        }, async (message) => {
            await search<AniList.Staff>(
                bot,
                message,
                async (search, page, viewer) => {
                    return await AniList.getStaffSearchPage(
                        search,
                        page,
                        viewer
                    );
                },
                staffSearchEmbed,
                staffEmbed
            );
        });
    }
}

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

async function search<T>(
    bot: Bot,
    message: Discord.Message,
    getResults: (
        search: string, page: number, viewer: AniList.Viewer
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
    let resultsView = await getResults(search, 0, viewer);
    if (resultsView.content.items.length == 0) {
        await bot.sendEmbed(
            message.channel,
            'No results found',
            'Double check your search query and try again.'
        );
        return;
    }
    if (resultsView.content.items.length == 1) {
        await message.channel.send(createEmbed(bot, {
            content: resultsView.content.items[0],
            viewer: viewer
        }));
        return;
    }

    const response = await message.channel.send(
        createResultsEmbed(bot, resultsView)
    );
    const navigator = new EmbedNavigator(
        response,
        message.author,
        resultsView.content.info,
        async (page) => {
            resultsView = await getResults(search, page, viewer);
            response.edit(createResultsEmbed(
                bot,
                resultsView
            ));
        }
    );
    await navigator.listen();

    const collector = new MessageCollector(message.channel, message.author);
    collector.onReply = (reply) => {
        navigator.stop();
        const results = resultsView.content.items;
        let selected = Number(reply.content);
        selected = selected % resultsView.content.info.perPage;
        if (!isNaN(selected) && selected >= 1 && selected <= results.length) {
            response.edit(createEmbed(bot, {
                content: results[selected - 1],
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

function searchResultsEmbed<T>(
    bot: Bot,
    resultsView: AniList.View<AniList.Page<T>>,
    items: {name: string, description: string}[]
) {
    const pageInfo = resultsView.content.info;
    const pageStr = `Page ${pageInfo.currentPage} / ${pageInfo.lastPage}`;
    const descStr = 'Enter the number of the item you are looking for:';
    const fields = items.map((item, i) => {
        const pageStartIndex = (pageInfo.currentPage - 1) * pageInfo.perPage;
        return {
            name: `${i + 1 + pageStartIndex}. ${item.name}`,
            value: item.description
        };
    });
    return new MessageEmbed({
        title: 'Search results',
        description: `${pageStr}\n\n${descStr}`,
        fields: fields
    }, bot);
}

function mediaSearchEmbed(
    bot: Bot,
    mediaSearchView: AniList.View<AniList.Page<AniList.Media>>
): Discord.MessageEmbed {
    const mediaList = mediaSearchView.content;
    const viewer = mediaSearchView.viewer;
    const items = mediaList.items.map((media) => {
        let title = AniList.mediaDisplayTitle(media.title, viewer);
        if (media.isAdult) title += ' (NSFW)';
        return {
            name:title,
            description: AniList.mediaFormatLabels[media.format] || 'No format'
        };
    });
    return searchResultsEmbed(bot, mediaSearchView, items);
}

function characterEmbed(
    bot: Bot,
    characterView: AniList.View<AniList.Character>
) {
    const character = characterView.content;
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
    const items = characters.map((character) => {
        let name = character.name.full;
        if (character.media.some((media) => media.isAdult)) name += ' (NSFW)';
        return {
            name: name,
            description: character.media.length > 0 ?
                AniList.mediaDisplayTitle(character.media[0].title, viewer) :
                'Unknown source'
        };
    });
    return searchResultsEmbed(bot, characterSearchView, items);
}

function staffSearchEmbed(
    bot: Bot,
    staffSearchView: AniList.View<AniList.Page<AniList.Staff>>
) {
    const staffList = staffSearchView.content.items;
    const items = staffList.map((staff) => {
        return {
            name: staff.name.full,
            description: staff.primaryOccupations.length > 0 ?
                staff.primaryOccupations[0] :
                'Unknown occupation'
        };
    });
    return searchResultsEmbed(bot, staffSearchView, items);
}

function staffEmbed(
    bot: Bot,
    staffView: AniList.View<AniList.Staff>
) {
    const staff = staffView.content;

    const dateString = (date: AniList.FuzzyDate): string => {
        return date && date.year && date.month && date.day ?
            `${months[date.month - 1]} ${date.day}, ${date.year}` : '';
    };

    const dateOfBirth = dateString(staff.dateOfBirth);
    const dateOfDeath = dateString(staff.dateOfDeath);

    let yearsActive =  '';
    if (staff.yearsActive[0]) {
        yearsActive = String(staff.yearsActive[0]);
        if (staff.yearsActive[1]) {
            yearsActive = `${yearsActive} - ${staff.yearsActive[1]}`;
        } else {
            yearsActive = `${yearsActive} - Present`;
        }
    }

    const fields = [];
    if (dateOfBirth) {
        fields.push({
            name: 'Date of birth',
            value: dateOfBirth,
            inline: true
        });   
    }
    if (dateOfDeath) {
        fields.push({
            name: 'Date of death',
            value: dateOfDeath,
            inline: true
        }); 
    }
    if (yearsActive) {
        fields.push({
            name: 'Years active',
            value: yearsActive,
            inline: true
        }); 
    }
    if (staff.primaryOccupations.length > 0) {
        fields.push({
            name: 'Occupation',
            value: staff.primaryOccupations.slice(0, 5).join(', '),
            inline: false
        });
    }
    if (staff.age) {
        fields.push({
            name: 'Age',
            value: staff.age,
            inline: true,
        });
    }
    if (staff.staffMedia.length > 0) {
        const noDupes = removeDuplicates(staff.staffMedia, (media) => media.id);
        fields.push({
            name: 'Worked on',
            value: noDupes.map((media) => {
                const title = AniList.mediaDisplayTitle(media.title);
                return `[${title}](${media.siteUrl})`;
            }).slice(0, 5).join('\n'),
            inline: false
        });
    }
    if (staff.characters.length > 0) {
        fields.push({
            name: 'Voice provider of',
            value: staff.characters.map((character) => {
                return `[${character.name.full}](${character.siteUrl})`;
            }).slice(0, 5).join('\n'),
            inline: false
        });
    }

    return new MessageEmbed({
        title: staff.name.full,
        url: staff.siteUrl,
        thumbnail: {
            url: staff.image.large,
        },
        description: cleanDescription(staff.description, staff.siteUrl),
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

function removeDuplicates<T>(array: T[], comparator: (item: T) => any): T[] {
    const set = new Set<any>();
    const result: T[] = [];
    for (const item of array) {
        if (!set.has(comparator(item))) {
            result.push(item);
            set.add(comparator(item));
        }
    }
    return result;
} 
