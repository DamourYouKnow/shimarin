import fetch from 'node-fetch';
import { GraphAPI } from './graphql';
import * as Data from './data';

export const redirectUri = 'https://anilist.co/api/v2/oauth/pin';
export const oauthUrl = 'https://anilist.co/api/v2/oauth/authorize';

export interface User {
    id: number,
    name: string,
    options: {
        profileColor: string
    },
    avatar: {
        medium: string
    }
    about: string,
    siteUrl: string,
    statistics: {
        anime: UserStatistics
    },
    favourites: {
        anime: Media[],
        manga: Media[],
        characters: Character[],
        staff: Staff[],
        // TODO: Add favourite Studio.
    }
}

export interface Viewer extends User {
    options: {
        titleLanguage: TitleLanguage,
        displayAdultContent: boolean,
        profileColor: string
    }
}

// TODO: Move this outside of the AniList module.
export interface View<ViewType> {
    content: ViewType,
    viewer?: Viewer
}

export interface MediaList {
    type: MediaType,
    status: MediaListStatus
    entries: MediaListItem[]
}

export interface MediaListFilter {
    type: MediaType,
    status: MediaListStatus
}

export interface MediaListItem {
    media: Media,
    progress: number | null;
}

export interface Media {
    id: number,
    type: MediaType,
    format: MediaFormat,
    status: MediaStatus,
    title: MediaTitle,
    description: string,
    coverImage: Image,
    chapters: number | null,
    episodes: number | null,
    genres: string[],
    tags: MediaTag[],
    averageScore: number,
    siteUrl: string,
    isAdult: boolean
}

export interface MediaTitle {
    english: string | null,
    romaji: string | null,
    native: string | null
}

export interface MediaTag {
    name: string
}

export interface Notification {
    media: Media,
    episode: number,
    createdAt: number
}

export interface Character {
    name: CharacterName,
    image: Image
    description: string,
    gender: string,
    dateOfBirth: FuzzyDate,
    age: string
    siteUrl: string,
    media: Media[]
}

export interface Staff {
    languageV2: string,
    name: Name,
    image: Image,
    description: string,
    primaryOccupations: string[]
    gender: string
    dateOfBirth: FuzzyDate,
    dateOfDeath: FuzzyDate,
    age: number,
    yearsActive: number[],
    homeTown: string,
    siteUrl: string,
    staffMedia: Media[],
    characters: Character[]
}
export interface UserStatistics {
    minutesWatched: number
}

export interface Name {
    first: string,
    middle: string,
    last: string,
    full: string,
    native: string,
    alternative: string[],
}

export interface CharacterName extends Name {
    alternativeSpoiler: string[]
}

export interface FuzzyDate {
    year: number,
    month: number,
    day: number
}

export interface Image {
    medium: string,
    large: string
}

export interface Page<ContentType> {
    items: ContentType[],
    info: PageInfo
}

export interface PageInfo {
    total: number,
    perPage: number,
    currentPage: number,
    lastPage: number,
    hasNextPage: boolean
}

export type MediaType = 'ANIME' | 'MANGA';

export type MediaStatus = 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED'
    | 'CANCELLED' | 'HIATUS';

export type MediaListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED'
    | 'PAUSED' | 'REPEATING';

export type MediaFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA'
    | 'ONA' | 'MUSIC' | 'MANGA' | 'NOVEL' | 'ONE_SHOT';

export const mediaFormatLabels: {[format in MediaFormat]: string} = {
    'TV': 'TV',
    'TV_SHORT': 'TV Short',
    'MOVIE': 'Movie',
    'SPECIAL': 'Special',
    'OVA': 'OVA',
    'ONA': 'ONA',
    'MUSIC': 'Music',
    'MANGA': 'Manga',
    'NOVEL': 'Novel',
    'ONE_SHOT': 'One-shot'
};

export const mediaStatusLabels: {
    [type in MediaType]: {
        [status in MediaStatus]: string
    }
} = {
    'ANIME': {
        'FINISHED': 'Finished',
        'CANCELLED': 'Cancelled',
        'HIATUS': 'Hiatus',
        'NOT_YET_RELEASED': 'Unreleased',
        'RELEASING': 'Airing'
    },
    'MANGA': {
        'FINISHED': 'Finished',
        'CANCELLED': 'Cancelled',
        'HIATUS': 'Hiatus',
        'NOT_YET_RELEASED': 'Unreleased',
        'RELEASING': 'Releasing'
    }
};

export type TitleLanguage = 'ENGLISH' | 'ROMAJI' | 'NATIVE';

const mediaFields = `
id
type
format
status
title {
    english
    romaji
    native
}
description(asHtml: false)
coverImage {
    medium
    large
}
episodes
chapters
genres
tags {
    name
}
averageScore
siteUrl
isAdult
`;

const api = new GraphAPI('https://graphql.anilist.co');

export async function getToken(
    apiClientId: number,
    apiClientSecret: string, 
    authCode: string
): Promise<string | null> {
    const response = await fetch('https://anilist.co/api/v2/oauth/token', {
        method: 'POST',
        timeout: 5000,
        headers: {
            'Content-type': 'application/json'
        },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: apiClientId,
            client_secret: apiClientSecret,
            redirect_uri: redirectUri,
            code: authCode
        })
    });
    if (!response.ok) return null;
    return (await response.json()).access_token;
}

export async function getViewerFromToken(
    token: string
): Promise<Viewer | null> {
    const response = await api.query(
        `
        {
            Viewer {
                id
                name
                options {
                    titleLanguage
                    displayAdultContent
                    profileColor
                }
                avatar {
                    medium
                }
            }
        }`,
        {}, token
    );
    if (!response.data) return null;
    return response.data?.Viewer as Viewer;
}

export async function getViewer(discordId: string): Promise<Viewer | null> {
    try {
        const connection = await Data.getAccountConnection(discordId);
        if (!connection) return null;
    return await getViewerFromToken(connection.token);
    } catch {
        return null;
    }
}

export async function searchUser(
    username: string
): Promise<User | null> {
    if (!username) return null;
    const response = await api.query(
        `query ($username: String) {    
            User(name: $username) {
                id
                name
                options {
                    profileColor
                }
                avatar {
                    medium
                }
            }
        }`,
        {
            username: username
        }
    );
    if (response.errors && response.errors.some((e) => e.status == 404)) {
        return null;
    }
    return response.data.User as User;
}

interface MediaSearchFilter {
    type: MediaType
}

export async function getCharacterSearchPage(
    search: string,
    page: number,
    viewer?: Viewer
): Promise<View<Page<Character>>> {
    const response = await api.query(
        `query (
            $search: String,
            $page: Int,
            $perPage: Int
        ) {
            Page (page: $page, perPage: $perPage) {
                pageInfo {
                    total
                    currentPage
                    lastPage
                    hasNextPage
                    perPage
                }
                characters (search: $search) {
                    name {
                        first
                        middle
                        last
                        full
                        native
                        alternative
                        alternativeSpoiler
                    }
                    image {
                        large
                        medium
                    }
                    description
                    gender
                    dateOfBirth {
                        year
                        month
                        day
                    }
                    age
                    siteUrl
                    media (sort: POPULARITY_DESC) {
                        nodes {
                            ${mediaFields}
                        }
                    }
                }
            }
        }`,
        {
            search: search,
            page: page,
            perPage: 10
        }
    );
    const results = response.data.Page?.characters;
    const charactersPage = {
        content: {
            items: results as Character[],
            info: response.data.Page.pageInfo as PageInfo
        },
        viewer: viewer
    };
    charactersPage.content.items.forEach((character: any) => {
        character.media = character.media.nodes;
    });
    return charactersPage;
}

export async function getMediaSearchPage(
    search: string,
    filter: MediaSearchFilter,
    page: number,
    viewer?: Viewer
): Promise<View<Page<Media>>> {
    const typeQuery = filter.type ? '$type: MediaType,' : '';
    const typeParam = filter.type ? ', type: $type' : '';
    const response = await api.query(
        `query (
            $search: String,
            ${typeQuery}
            $page: Int,
            $perPage: Int
        ) {
            Page (page: $page, perPage: $perPage) {
                pageInfo {
                    total
                    currentPage
                    lastPage
                    hasNextPage
                    perPage
                }
                media (search: $search${typeParam}) {
                    ${mediaFields}
                }
            }
        }`,
        {
            search: search,
            ...(filter.type ? {type: filter.type} : {}),
            page: page,
            perPage: 10
        }
    );
    const results = response.data.Page?.media;
    return {
        content: {
            items: results as Media[],
            info: response.data.Page.pageInfo as PageInfo
        },
        viewer: viewer
    };
}

export async function getStaffSearchPage(
    search: string,
    page: number,
    viewer?: Viewer
): Promise<View<Page<Staff>>> {
    /*
    languageV2: string,
    name: Name,
    image: Image,
    description: string,
    primaryOccupations: string[]
    gender: string
    dateOfBirth: FuzzyDate,
    dateOfDeath: FuzzyDate,
    age: number,
    yearsActive: number[],
    homeTown: string,
    siteUrl: string,
    staffMedia: Media[],
    characters: Character[]
    */
    const response = await api.query(
        `query (
            $search: String,
            $page: Int,
            $perPage: Int
        ) {
            Page (page: $page, perPage: $perPage) {
                pageInfo {
                    total
                    currentPage
                    lastPage
                    hasNextPage
                    perPage
                }
                staff (search: $search) {
                    name {
                        first
                        middle
                        last
                        full
                        native
                        alternative
                    }
                    image {
                        large
                        medium
                    }
                    description
                    primaryOccupations
                    gender
                    dateOfBirth {
                        year
                        month
                        day
                    }
                    dateOfDeath {
                        year
                        month
                        day
                    }
                    age
                    yearsActive
                    homeTown
                    siteUrl
                    staffMedia (sort: POPULARITY_DESC) {
                        nodes {
                            id
                            title {
                                english
                                romaji
                                native
                            }
                            siteUrl
                        }
                    }
                    characters (sort: FAVOURITES) {
                        nodes {
                            name {
                                full
                            }
                            siteUrl
                        }
                    }
                }
            }
        }`,
        {
            search: search,
            page: page,
            perPage: 10
        }
    );
    const results = response.data.Page?.staff;
    const staffPage = {
        content: {
            items: results as Staff[],
            info: response.data.Page.pageInfo as PageInfo
        },
        viewer: viewer
    };
    staffPage.content.items.forEach((staff: any) => {
        staff.staffMedia = staff.staffMedia.nodes;
        staff.characters = staff.characters.nodes;
    });
    return staffPage;
}


export async function getMediaListPage(
    userId: number,
    filter: MediaListFilter,
    page: number,
    viewer?: Viewer
): Promise<View<Page<MediaListItem>> | null> {
    const response = await api.query(
        `query (
            $userId: Int,
            $type: MediaType,
            $status: MediaListStatus,
            $page: Int,
            $perPage: Int
        ) {
            Page (page: $page, perPage: $perPage) {
                pageInfo {
                    total
                    currentPage
                    lastPage
                    hasNextPage
                    perPage
                }
                mediaList (
                    userId: $userId,
                    type: $type,
                    status: $status,
                    sort: [UPDATED_TIME_DESC]
                ) {
                    media {
                        ${mediaFields}
                    }
                    progress
                }
            }
        }`,
        {
            userId: userId,
            type: filter.type,
            status: filter.status,
            page: page,
            perPage: 6
        }
    );
    const results = response.data.Page?.mediaList;
    if (!results) return null;
    return {
        content: {
            items: results as MediaListItem[],
            info: response.data.Page.pageInfo as PageInfo
        },
        viewer: viewer
    };
}

export async function getUserSearchPage(
    search: string,
    page: number,
    viewer?: Viewer
): Promise<View<Page<User>> | null> {
    const response = await api.query(
        `query (
            $search: String,
            $page: Int,
            $perPage: Int
        ) {
            Page (page: $page, perPage: $perPage) {
                pageInfo {
                    total
                    currentPage
                    lastPage
                    hasNextPage
                    perPage
                }
                users (search: $search) {
                    name
                    options {
                        profileColor
                    }
                    avatar {
                        medium
                    }
                    about(asHtml: false)
                    siteUrl
                    statistics {
                        anime {
                            minutesWatched
                        }
                    }
                    favourites {
                        anime(page: 0, perPage: 5) {
                            nodes {
                                title {
                                    english
                                    romaji
                                    native
                                }
                                siteUrl
                            }
                        }
                        manga(page: 0, perPage: 5) {
                            nodes {
                                title {
                                    english
                                    romaji
                                    native
                                }
                                siteUrl
                                }
                            }
                        characters(page: 0, perPage: 5) {
                            nodes{
                                name {
                                    full
                                }
                                siteUrl
                            }
                        }
                        staff(page: 0, perPage: 5) {
                            nodes {
                                name {
                                    full
                                }
                                siteUrl
                            } 
                        }
                    }
                }
            }
        }`,
        {
            search: search,
            page: page,
            perPage: 10
        }
    );
    const results = response.data.Page?.users;
    const usersPage = {
        content: {
            items: results as User[],
            info: response.data.Page.pageInfo as PageInfo
        },
        viewer: viewer
    };

    usersPage.content.items.forEach((user: any) => {
        user.favourites.anime = user.favourites.anime.nodes;
        user.favourites.manga = user.favourites.manga.nodes;
        user.favourites.characters = user.favourites.characters.nodes;
        user.favourites.staff = user.favourites.staff.nodes;
    });
    return usersPage;
}

export async function getNotifiations(
    token: string,
    page: number,
): Promise<View<Page<Notification>> | null> {
    const response = await api.query(
        `query (
            $type: NotificationType,
            $page: Int,
            $perPage: Int
        ) {
            Page (page: $page, perPage: $perPage) {
                pageInfo {
                    total
                    currentPage
                    lastPage
                    hasNextPage
                    perPage
                }
                notifications (
                    type: $type,
                ) {
                    ... on AiringNotification {
                        media {
                            title {
                                english
                                romaji
                                native
                            }
                        }
                        createdAt
                        episode
                    }
                }
            }
        }`,
        {
            type: 'AIRING',
            page: page,
            perPage: 10
        },
        token
    );
    const results = response.data.Page?.notifications;
    if (!results) return null;
    return {
        content: {
            items: results as Notification[],
            info: response.data.Page.pageInfo as PageInfo
        },
    };
}

export function mediaDisplayTitle(title: MediaTitle, viewer?: Viewer): string {
    const titleOrders: {[lang in TitleLanguage]: string[]} = {
        'ENGLISH': [title.english, title.romaji, title.native],
        'ROMAJI': [title.romaji, title.english, title.native],
        'NATIVE': [title.native, title.romaji, title.english]
    };
    const titleOrder = viewer ?
            titleOrders[viewer.options.titleLanguage] : titleOrders['ENGLISH'];
    return titleOrder.find((title) => title != null) || 'No title';
}