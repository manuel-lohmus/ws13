import type { CreateWebSocketExport, WebSocketLike, Registry } from './core/index';
// import type { ChannelsManager } from './extensions/channels/index';

//export * from './core/index';
//export * from './extensions/channels/index';

/** Main ws13 export with core + extensions */
declare const ws13: CreateWebSocketExport & {
    //createChannels: ChannelsManager['createChannels'];
};

export = ws13;

/** Merge ChannelsManager methods into Registry */
declare module './core/index' {
    // interface Registry extends ChannelsManager { }
}
