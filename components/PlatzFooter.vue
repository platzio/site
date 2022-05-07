<template>
  <div class="bg-secondary text-light footer">
    <div class="container text-center py-4">
      <div class="h5 fw-normal my-3">
        Free and open-source under the Apache-2.0 License
      </div>
      <div class="my-3">
        <a class="me-3" href="https://github.com/platzio" target="_github">
          GitHub
        </a>
        <a
          class="me-3"
          href="https://artifacthub.io/packages/helm/platz-io/platzio"
          target="_artifacthub"
        >
          ArtifactHub
        </a>
        <a class="me-3" href="https://twitter.com/platzio" target="_twitter">
          Twitter
        </a>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.footer {
  a {
    color: var(--bs-light);

    &:hover,
    &:active {
      color: var(--bs-warning);
    }
  }
}
</style>
