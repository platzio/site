import { Context } from '@nuxt/types';

export async function asyncData({ $content, route, params, error }: Context) {
    const collection_name = route.fullPath.split("/").filter((s) => s)[0];

    const path =
        params.pathMatch === "" || params.pathMatch === "/"
            ? "index"
            : params.pathMatch;

    const page = await $content(collection_name, { deep: true }, path)
        .fetch()
        .catch((err) => {
            error({ statusCode: 404, message: "Page not found" });
        });

    const entireCollection = await $content(collection_name, { deep: true })
        .only(["title", "category", "position", "path"])
        .sortBy("position")
        .fetch();

    return {
        entireCollection,
        page,
    };
}
