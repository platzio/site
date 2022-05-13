<template>
  <nav class="navbar navbar-expand navbar-platz">
    <NuxtLink to="/" tag="a" class="navbar-brand" active-class="active">
      <PlatzLogo size="2.5rem" />
    </NuxtLink>

    <div>
      <ul class="navbar-nav">
        <li class="nav-item">
          <NuxtLink to="/docs/" class="nav-link" active-class="active">
            Docs
          </NuxtLink>
        </li>
        <li class="nav-item">
          <NuxtLink to="/api/" class="nav-link" active-class="active">
            API
          </NuxtLink>
        </li>
        <li class="nav-item">
          <NuxtLink to="/blog/" class="nav-link" active-class="active">
            Blog
          </NuxtLink>
        </li>
      </ul>
    </div>
  </nav>
</template>
