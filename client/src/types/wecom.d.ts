interface WwLoginOptions {
  id: string;
  appid: string;
  agentid: string;
  redirect_uri: string;
  state?: string;
  href?: string;
  lang?: 'zh' | 'en';
}

declare class WwLogin {
  constructor(options: WwLoginOptions);
}
