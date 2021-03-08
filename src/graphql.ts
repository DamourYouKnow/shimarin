import http, { AxiosRequestConfig } from 'axios';

interface GraphResponse {
    data: any,
    errors?: GraphError[]
}

interface GraphError {
    message: string,
    status: number,
    locations: GraphErrorLocation[]
    validation: {[key: string]: string}
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

    async query(
        query: string,
        variables: unknown,
        token?: string
    ): Promise<GraphResponse> {
        try {
            const config: AxiosRequestConfig = {
                timeout: 5000
            };
            if (token) config.headers = { 'Authorization': `Bearer ${token}` };
            const response = await http.post(this.url, {
                query: query,
                variables: variables
            }, config);
            return response.data;
        } catch (err) {
            if (err.response && err.response?.data?.errors) {
                return err.response.data;
            } else {
                throw err;
            }
        }
    }
}
