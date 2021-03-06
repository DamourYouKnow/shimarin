import http from 'axios';

interface GraphResponse {
    data: any,
    errors?: GraphError[]
}

interface GraphError {
    message: string,
    status: number,
    locations: GraphErrorLocation[]
}

interface GraphErrorLocation {
    line: number,
    column: number
}

export class GraphAPI {
    url: string;

    constructor(url: string) {
        this.url = url;
    }

    async query(query: string, variables: unknown): Promise<GraphResponse> {
        const response = await http.post(this.url, {
            query: query,
            variables: variables
        }, {
            timeout: 5000
        });
        return response.data;
    }
}
