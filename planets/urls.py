from django.urls import path, include
from . import views

urlpatterns = [
    path('', views.orbits, name='home'),  # página principal ahora muestra orbits
    path('distance/<str:planet_name>/', views.distance_view, name='distance'),  # detalles por planeta
    path('orbits/', views.orbits, name='orbits'),  # tu página 1
    path('api/planet-info/', views.planet_info_api, name='planet_info_api'),
    path('api/space-weather/', views.space_weather_api, name='space_weather_api'),
    path('api/orbit-positions/', views.orbit_positions_api, name='orbit_positions_api'),
    path('pagina2/', views.pagina2, name='pagina2'),  # página 2
    path('pagina3/', views.pagina3, name='pagina3'),  # página 3
    path("__reload__/", include("django_browser_reload.urls")),
]
