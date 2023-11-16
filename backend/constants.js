const constants = {
    baseUrl: `${process.env.HOST}:${process.env.PORT}` ?? `http://jj-photos.wnet.wn:3020`,
    defaultCollectionName: 'photos',
};

export default constants;